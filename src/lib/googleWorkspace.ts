import { getAccessToken } from './firebase';
import { PPKSRecord } from '../types';

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  iconLink?: string;
  createdTime?: string;
}

export interface GoogleFormResponse {
  responseId: string;
  createTime: string;
  lastSubmittedTime?: string;
  answers: Record<string, { textAnswers?: { answers: { value: string }[] } }>;
}

function requireToken(token: string | null): string {
  if (!token) throw new Error('Token akses Google belum tersedia atau telah hilang setelah halaman dimuat ulang. Buka Koneksi Akun dan tekan “Pulihkan Izin Google API”, lalu ulangi operasi.');
  return token;
}

async function googleJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = requireToken(await getAccessToken());
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const apiError = (data as { error?: { message?: string; status?: string; errors?: { reason?: string }[] } }).error;
    const message = apiError?.message || `HTTP ${res.status}`;
    const reason = apiError?.errors?.[0]?.reason || apiError?.status || '';
    if (res.status === 401) {
      throw new Error('Google API menolak token (HTTP 401). Token mungkin kedaluwarsa; tekan “Pulihkan Izin Google API” di tab Koneksi Akun lalu ulangi operasi.');
    }
    if (res.status === 403 && /insufficient|scope/i.test(`${reason} ${message}`)) {
      throw new Error(`Izin OAuth Google kurang (HTTP 403): ${message}. Otorisasi ulang dan pastikan scope Drive/Sheets/Forms disetujui akun.`);
    }
    if (res.status === 403 && /SERVICE_DISABLED|has not been used|disabled/i.test(`${reason} ${message}`)) {
      throw new Error(`Google API belum diaktifkan pada Google Cloud project OAuth: ${message}. Aktifkan API yang disebutkan pada Google Cloud Console.`);
    }
    if (res.status === 403) {
      throw new Error(`Akses Google API ditolak (HTTP 403): ${message}. Pastikan akun Google mempunyai akses editor pada spreadsheet/folder dan scope disetujui.`);
    }
    throw new Error(`Google API gagal (HTTP ${res.status}): ${message}`);
  }
  return data as T;
}

/** Extracts a Google Drive folder ID from either an ID or a Drive folder URL. */
export function extractDriveFolderId(input: string): string {
  const value = input.trim();
  const match = value.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  const id = match?.[1] || value;
  if (!/^[a-zA-Z0-9_-]{10,}$/.test(id)) throw new Error('ID/URL folder Google Drive tidak valid.');
  return id;
}

/** Extracts a spreadsheet ID from either an ID or a Google Sheets URL. */
export function extractSpreadsheetId(input: string): string {
  const value = input.trim();
  const match = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  const id = match?.[1] || value;
  if (!/^[a-zA-Z0-9_-]{10,}$/.test(id)) throw new Error('ID/URL Google Spreadsheet tidak valid.');
  return id;
}

/** Extracts a Form ID from the editor URL or a raw Form ID. Short forms.gle links are not API IDs. */
export function extractFormId(input: string): string {
  const value = input.trim();
  if (/forms\.gle\//i.test(value)) {
    throw new Error('Gunakan URL editor Google Form (docs.google.com/forms/d/FORM_ID/edit), bukan tautan pendek forms.gle.');
  }
  const match = value.match(/\/forms\/d\/([a-zA-Z0-9_-]+)/);
  const id = match?.[1] || value;
  if (!/^[a-zA-Z0-9_-]{10,}$/.test(id)) throw new Error('ID/URL Google Form tidak valid.');
  return id;
}

/** GOOGLE DRIVE API — lists only items inside the configured folder when folder URL/ID is provided. */
export async function listDriveFiles(query = '', folderUrlOrId?: string): Promise<GoogleDriveFile[]> {
  const clauses = ['trashed = false'];
  if (folderUrlOrId?.trim()) clauses.push(`'${extractDriveFolderId(folderUrlOrId)}' in parents`);
  if (query.trim()) clauses.push(query.trim());
  const params = new URLSearchParams({
    pageSize: '100',
    orderBy: 'name',
    fields: 'nextPageToken,files(id,name,mimeType,webViewLink,iconLink,createdTime)',
    q: clauses.join(' and '),
  });
  const data = await googleJson<{ files?: GoogleDriveFile[] }>(`https://www.googleapis.com/drive/v3/files?${params}`);
  return data.files || [];
}

export async function createDriveFolder(folderName: string): Promise<GoogleDriveFile> {
  if (!folderName.trim()) throw new Error('Nama folder tidak boleh kosong.');
  return googleJson<GoogleDriveFile>('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    body: JSON.stringify({ name: folderName.trim(), mimeType: 'application/vnd.google-apps.folder' }),
  });
}

/** Returns actual tab titles from the spreadsheet metadata; does not assume a tab name. */
export async function getSpreadsheetSheetTitles(spreadsheetIdOrUrl: string): Promise<string[]> {
  const id = extractSpreadsheetId(spreadsheetIdOrUrl);
  const data = await googleJson<{ sheets?: { properties?: { title?: string } }[] }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties.title`
  );
  return (data.sheets || []).map(sheet => sheet.properties?.title || '').filter(Boolean);
}

export const SIPANDU_DATABASE_HEADERS = [
  'ID',
  'Timestamp',
  'Nama Lengkap',
  'NIK',
  'Usia',
  'Jenis Kelamin',
  'Kota Domisili',
  'No HP/WA',
  'Jenis Bantuan',
  'Intervensi Mental',
  'Desil',
] as const;

/**
 * Ensures a dedicated SIPANDU database tab exists. This is deliberately separate
 * from the Google Form response spreadsheet, whose rows are owned by Forms.
 */
export async function ensureSIPANDUDatabaseSheet(spreadsheetIdOrUrl: string): Promise<void> {
  const id = extractSpreadsheetId(spreadsheetIdOrUrl);
  const titles = await getSpreadsheetSheetTitles(id);
  if (!titles.includes('SIPANDU')) {
    await googleJson(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: 'SIPANDU' } } }] }),
    });
  }

  const current = await readSpreadsheetData(id, 'SIPANDU!A1:K1');
  const header = current[0] || [];
  if (header.every((cell) => !cell.trim())) {
    await googleJson(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent('SIPANDU!A1:K1')}?valueInputOption=RAW`, {
      method: 'PUT',
      body: JSON.stringify({ values: [[...SIPANDU_DATABASE_HEADERS]] }),
    });
    return;
  }

  const isExpected = SIPANDU_DATABASE_HEADERS.every((expected, index) => header[index]?.trim() === expected);
  if (!isExpected) {
    throw new Error('Tab SIPANDU sudah berisi header yang tidak sesuai. Data tidak diubah. Gunakan spreadsheet database SIPANDU khusus atau sesuaikan 11 header: ID, Timestamp, Nama Lengkap, NIK, Usia, Jenis Kelamin, Kota Domisili, No HP/WA, Jenis Bantuan, Intervensi Mental, Desil.');
  }
}

/** GOOGLE SHEETS API */
export async function readSpreadsheetData(spreadsheetIdOrUrl: string, range = 'Sheet1!A1:Z100'): Promise<string[][]> {
  const id = extractSpreadsheetId(spreadsheetIdOrUrl);
  const data = await googleJson<{ values?: unknown[][] }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}`
  );
  return (data.values || []).map(row => row.map(value => String(value ?? '')));
}

/**
 * Appends a SIPANDU database row to a dedicated SIPANDU data sheet only.
 * Do not point this at the Google Form's response tab: that tab is owned by Forms.
 * API errors are thrown rather than reported as a successful sync.
 */
export async function upsertPPKSInSpreadsheet(
  spreadsheetIdOrUrl: string,
  ppks: PPKSRecord,
  range = 'SIPANDU!A:K',
): Promise<'inserted' | 'updated'> {
  const id = extractSpreadsheetId(spreadsheetIdOrUrl);
  const existingRows = await readSpreadsheetData(id, range);
  const headers = existingRows[0] || [];
  const idIndex = headers.findIndex((h) => h.trim().toLowerCase() === 'id');
  const nikIndex = headers.findIndex((h) => ['nik', 'nomor induk kependudukan'].includes(h.trim().toLowerCase()));
  if (idIndex < 0 || nikIndex < 0) {
    throw new Error('Header tab database tidak memiliki kolom ID/NIK yang diperlukan. Periksa tab SIPANDU.');
  }

  const row = [
    ppks.id,
    ppks.timestamp,
    ppks.namaLengkap,
    ppks.nik,
    String(ppks.usia),
    ppks.jenisKelamin,
    ppks.kotaDomisili,
    ppks.noHpWa,
    ppks.jenisBantuan,
    ppks.intervensiMental,
    `Desil ${ppks.desil}`,
  ];

  const matchingIdIndex = existingRows.findIndex((cells, index) =>
    index > 0 && cells[idIndex] === ppks.id
  );
  if (matchingIdIndex > 0) {
    const sheetRow = matchingIdIndex + 1; // array row 1 is spreadsheet row 2
    const updateRange = `SIPANDU!A${sheetRow}:K${sheetRow}`;
    await googleJson(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(updateRange)}?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      body: JSON.stringify({ values: [row] }),
    });
    return 'updated';
  }

  const matchingNikIndex = ppks.nik
    ? existingRows.findIndex((cells, index) => index > 0 && cells[nikIndex] === ppks.nik)
    : -1;
  if (matchingNikIndex > 0) {
    throw new Error('NIK sudah terdaftar pada ID PPKS lain di tab SIPANDU. Sinkronisasi dihentikan untuk mencegah penggabungan dua record yang berbeda; periksa duplikasi di database.');
  }

  await googleJson(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: 'POST',
    body: JSON.stringify({ values: [row] }),
  });
  return 'inserted';
}

export async function createGoogleSpreadsheet(title: string): Promise<string> {
  if (!title.trim()) throw new Error('Judul Spreadsheet tidak boleh kosong.');
  const data = await googleJson<{ spreadsheetId: string }>('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    body: JSON.stringify({
      properties: { title: title.trim() },
      sheets: [{
        properties: { title: 'SIPANDU' },
        data: [{
          startRow: 0,
          startColumn: 0,
          rowData: [{
            values: [...SIPANDU_DATABASE_HEADERS]
              .map(value => ({ userEnteredValue: { stringValue: value } })),
          }],
        }],
      }],
    }),
  });
  if (!data.spreadsheetId) throw new Error('Google tidak mengembalikan ID Spreadsheet.');
  return data.spreadsheetId;
}

/** GOOGLE FORMS API — fetches all pages, not just the first page. */
export async function fetchFormResponses(formUrlOrId: string): Promise<GoogleFormResponse[]> {
  const formId = extractFormId(formUrlOrId);
  const all: GoogleFormResponse[] = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({ pageSize: '500' });
    if (pageToken) params.set('pageToken', pageToken);
    const data = await googleJson<{ responses?: GoogleFormResponse[]; nextPageToken?: string }>(
      `https://forms.googleapis.com/v1/forms/${formId}/responses?${params}`
    );
    all.push(...(data.responses || []));
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return all;
}
