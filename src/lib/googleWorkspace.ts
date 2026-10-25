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
  if (!token) throw new Error('Silakan masuk dengan akun Google yang memiliki akses ke sumber SIPANDU.');
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
    const message = (data as { error?: { message?: string } }).error?.message;
    throw new Error(message || `Google API gagal (HTTP ${res.status}). Periksa izin akun dan API yang diaktifkan.`);
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
export async function appendPPKSToSpreadsheet(
  spreadsheetIdOrUrl: string,
  ppks: PPKSRecord,
  range = 'SIPANDU!A:K',
): Promise<boolean> {
  const id = extractSpreadsheetId(spreadsheetIdOrUrl);
  const existingRows = await readSpreadsheetData(id, range);
  const headers = existingRows[0] || [];
  const idIndex = headers.findIndex(h => h.trim().toLowerCase() === 'id');
  const nikIndex = headers.findIndex(h => ['nik', 'nomor induk kependudukan'].includes(h.trim().toLowerCase()));
  if (existingRows.slice(1).some(row =>
    (idIndex >= 0 && row[idIndex] === ppks.id) ||
    (nikIndex >= 0 && ppks.nik && row[nikIndex] === ppks.nik)
  )) {
    return true; // already present; do not append a duplicate
  }
  if (existingRows.length === 0) {
    throw new Error(`Tab/rentang ${range} belum memiliki baris header. Buat tab SIPANDU dan header termasuk kolom ID sebelum sinkronisasi.`);
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
  await googleJson('https://sheets.googleapis.com/v4/spreadsheets/' + id +
    '/values/' + encodeURIComponent(range) + ':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS', {
      method: 'POST',
      body: JSON.stringify({ values: [row] }),
    });
  return true;
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
            values: ['ID', 'Timestamp', 'Nama Lengkap', 'NIK', 'Usia', 'Jenis Kelamin', 'Kota Domisili', 'No HP/WA', 'Jenis Bantuan', 'Intervensi Mental', 'Desil']
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
