import { getAccessToken, invalidateAccessToken, refreshWorkspaceAccessToken } from './firebase';
import { IntegratedFormData, PPKSRecord } from '../types';
import { normalizeExactNumericNIK } from './nikNumeric';
import { deduplicatePPKSRecords, sortPPKSRecordsByTimestamp } from './ppksData';
import { classifyPPKSPhotoHeader, normalizePPKSPhotoSource, readPPKSPhotoSourceByKind } from './photoSources';
import { googleDriveViewUrl, matchFormPhotoResponseForPPKS, isGoogleFormLinkedToSpreadsheet, type FormPhotoResponseCandidate } from './formPhotoRecovery';
import { GOOGLE_SIPANDU_RESOURCES } from './googleSIPANDUResources';
import { isLegacySamplePPKS, isObviousDemoMarker, LEGACY_SAMPLE_PPKS_IDS, LEGACY_SAMPLE_PPKS_NAMES } from '../data/initialData';

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
  answers: Record<string, {
    textAnswers?: { answers: { value: string }[] };
    fileUploadAnswers?: { answers: { fileId: string; fileName?: string; mimeType?: string }[] };
  }>;
}

function requireToken(token: string | null): string {
  if (!token) throw new Error('Token Google belum tersedia setelah upaya penyegaran otomatis. Pastikan sesi akun Google Workspace masih aktif; jika browser memblokir refresh tanpa dialog, pulihkan izin satu kali melalui Koneksi Akun.');
  return token;
}

async function googleJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  let token = requireToken(await getAccessToken());

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
    if (res.ok) return await res.json() as T;

    const data = await res.json().catch(() => ({}));
    const apiError = (data as { error?: { message?: string; status?: string; errors?: { reason?: string }[] } }).error;
    const message = apiError?.message || `HTTP ${res.status}`;
    const reason = apiError?.errors?.[0]?.reason || apiError?.status || '';

    if (res.status === 401 && attempt === 0) {
      invalidateAccessToken();
      // Retry once using a newly issued token from the existing Workspace session.
      const refreshed = await refreshWorkspaceAccessToken();
      if (refreshed) {
        token = refreshed;
        continue;
      }
      throw new Error('Token Google API telah kedaluwarsa. SIPANDU sudah mencoba memperbaruinya otomatis, tetapi browser tidak menyelesaikan refresh tersembunyi. Jika sinkronisasi tetap berhenti, gunakan “Pulihkan Izin Google API” satu kali untuk memulihkan sesi.');
    }
    if (res.status === 401) {
      invalidateAccessToken();
      throw new Error('Token Google API ditolak setelah percobaan refresh otomatis. Periksa izin Google Workspace dan ulangi sinkronisasi.');
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

  throw new Error('Google API gagal setelah percobaan refresh token otomatis.');
}


/** Lists real Google Sheets files the authorized account can access across My Drive/shared drives. */
export async function listDriveSpreadsheets(): Promise<GoogleDriveFile[]> {
  const all: GoogleDriveFile[] = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({
      q: "mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false",
      pageSize: '100',
      orderBy: 'modifiedTime desc',
      fields: 'nextPageToken,files(id,name,mimeType,webViewLink,createdTime)',
      includeItemsFromAllDrives: 'true',
      supportsAllDrives: 'true',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const data = await googleJson<{ files?: GoogleDriveFile[]; nextPageToken?: string }>(
      `https://www.googleapis.com/drive/v3/files?${params.toString()}`
    );
    all.push(...(data.files || []));
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return all;
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

/** Returns spreadsheet name and actual tab titles from the Google Sheets API. */
export async function getSpreadsheetMetadata(spreadsheetIdOrUrl: string): Promise<{
  spreadsheetId: string;
  title: string;
  sheetTitles: string[];
}> {
  const id = extractSpreadsheetId(spreadsheetIdOrUrl);
  const data = await googleJson<{
    spreadsheetId?: string;
    properties?: { title?: string };
    sheets?: { properties?: { title?: string } }[];
  }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=spreadsheetId,properties.title,sheets.properties.title`
  );
  return {
    spreadsheetId: data.spreadsheetId || id,
    title: data.properties?.title || 'Google Spreadsheet',
    sheetTitles: (data.sheets || []).map(sheet => sheet.properties?.title || '').filter(Boolean),
  };
}

export async function getSpreadsheetSheetTitles(spreadsheetIdOrUrl: string): Promise<string[]> {
  return (await getSpreadsheetMetadata(spreadsheetIdOrUrl)).sheetTitles;
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

/** Reads displayed cell values plus hyperlink URLs (Google Forms file-upload cells often store links as cell hyperlinks). */
export async function readSpreadsheetRichData(
  spreadsheetIdOrUrl: string,
  range: string,
): Promise<string[][]> {
  const id = extractSpreadsheetId(spreadsheetIdOrUrl);
  const params = new URLSearchParams({
    ranges: range,
    includeGridData: 'true',
    fields: 'sheets(properties(title),data(rowData(values(formattedValue,userEnteredValue.stringValue,userEnteredValue.numberValue,effectiveValue.stringValue,effectiveValue.numberValue,hyperlink,textFormatRuns(format(link(uri)))))))',
  });
  const data = await googleJson<{
    sheets?: {
      properties?: { title?: string };
      data?: {
        rowData?: {
          values?: {
            formattedValue?: string;
            userEnteredValue?: { stringValue?: string; numberValue?: number };
            effectiveValue?: { stringValue?: string; numberValue?: number };
            hyperlink?: string;
            textFormatRuns?: Array<{ format?: { link?: { uri?: string } } }>;
          }[];
        }[];
      }[];
    }[];
  }>(`https://sheets.googleapis.com/v4/spreadsheets/${id}?${params.toString()}`);

  const rowData = data.sheets?.[0]?.data?.[0]?.rowData || [];
  const headerCells = rowData[0]?.values || [];
  const headers = headerCells.map((cell) =>
    String(cell.userEnteredValue?.stringValue || cell.formattedValue || '')
  );
  const normalizedHeaders = headers.map(normalizeSheetHeader);
  const photoColumns = new Set<number>();
  const timestampColumns = new Set<number>();
  normalizedHeaders.forEach((header, index) => {
    if (/^(timestamp|capwaktu|waktupengiriman|waktupengisian|tanggalwaktu|tanggaljam|wakturespon|wakturespons|createdtime|lastsubmittedtime)$/.test(header) ||
        /^(timestamp|capwaktu|waktupengiriman|waktupengisian)/.test(header)) {
      timestampColumns.add(index);
    }

    // Do not classify standalone KTP/NIK headers as photo cells. A header such
    // as "NIK/No. KTP" must preserve the displayed NIK, not substitute its hyperlink.
    if (/(foto|photo|gambar|image|upload|unggah|lampiran|scan|dokumen|berkas|file|tautan|linkdrive|bukti|dokumentasi|selfie|pasfoto|portrait)/i.test(header)) {
      photoColumns.add(index);
    }
  });

  return rowData.map((row) => (row.values || []).map((cell, index) => {
    const displayValue = String(
      cell.userEnteredValue?.stringValue ||
      cell.effectiveValue?.stringValue ||
      cell.formattedValue ||
      ''
    );
    // Preserve Google Sheets' displayed timestamp format when the underlying
    // date is numeric. Use an ISO wall-clock only as a fallback if Sheets gives
    // no formatted value, so the application matches the visible source cell.
    const timestampNumber = cell.effectiveValue?.numberValue ?? cell.userEnteredValue?.numberValue;
    if (timestampColumns.has(index) && typeof timestampNumber === 'number' && timestampNumber >= 20000 && timestampNumber <= 80000) {
      const formattedTimestamp = String(cell.formattedValue || '').trim();
      if (formattedTimestamp) return formattedTimestamp;
      const date = new Date(Date.UTC(1899, 11, 30) + Math.round(timestampNumber * 86400000));
      const pad = (number: number) => String(number).padStart(2, '0');
      return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
    }
    const runLink = cell.textFormatRuns?.find((run) => run.format?.link?.uri)?.format?.link?.uri;
    const actualLink = cell.hyperlink || runLink || '';
    // Use underlying Drive URLs only for columns that are photo/upload/document
    // questions. For NIK and all other text columns, keep the displayed value
    // so a rich-text hyperlink cannot replace an identity number with its URL.
    if (photoColumns.has(index) && actualLink) return String(actualLink);

    // A numeric NIK cell may have scientific notation as its visible format.
    // Recover it only from Sheets' underlying numberValue when the number is
    // still an exact safe integer and the column header is actually a NIK/KTP
    // identity field, never from a rounded display string.
    if (!photoColumns.has(index) && isLikelyRespondentNIKHeader(headers[index] || '')) {
      const numericNIK = normalizeExactNumericNIK(
        cell.effectiveValue?.numberValue ?? cell.userEnteredValue?.numberValue
      );
      if (numericNIK) return numericNIK;
    }
    return displayValue || (photoColumns.has(index) ? String(actualLink) : '');
  }));
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


function normalizeSheetHeader(value: string): string {
  return String(value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/^\s*\d{1,2}[\s.)\-:]+/, '').replace(/[^a-z0-9]/g, '');
}

function readRespondentName(headers: string[], row: string[]): string {
  const direct = readCellByAliases(headers, row, [
    'namaLengkap', 'namaResponden', 'namaCalonResponden', 'namaPPKS',
    'namaCalonPPKS', 'namaODHIV', 'namaLengkapSesuaiKTP', 'namaSesuaiKTP',
    'namaRespondenSesuaiKTP', 'nama',
  ]);
  if (direct) return direct;

  const excluded = /(ayah|ibu|orangtua|wali|suami|istri|pasangan|keluarga|pendamping|petugas|asesor|asessor|supervisor|kontakdarurat|kontakemergensi|orangterdekat)/;
  const candidates = headers
    .map((header, index) => ({ header: String(header || '').trim(), normalized: normalizeSheetHeader(header), value: String(row[index] ?? '').trim(), index }))
    .filter(({ normalized, value }) => normalized.includes('nama') && value && !excluded.test(normalized))
    .sort((a, b) => {
      const score = (header: string, normalized: string) =>
        (normalized.startsWith('namalengkap') ? 100 : 0) +
        (/(responden|calonppks|calonresponden|odhiv|ppks)/.test(normalized) ? 65 : 0) +
        (/(sesuaiktp|sesuaikartuidentitas)/.test(normalized) ? 25 : 0) -
        (normalized.length > 120 ? 10 : 0);
      return score(b.header, b.normalized) - score(a.header, a.normalized) || a.index - b.index;
    });
  return candidates[0]?.value || '';
}

function readCellByAliases(headers: string[], row: string[], aliases: string[]): string {
  const normalizedHeaders = headers.map(normalizeSheetHeader);
  const normalizedAliases = [...aliases].map(normalizeSheetHeader).sort((a, b) => b.length - a.length);
  for (const alias of normalizedAliases) {
    const index = normalizedHeaders.indexOf(alias);
    if (index >= 0 && row[index] !== undefined && row[index].trim() !== '') return row[index].trim();
  }
  // Match longer phrases within Google Forms question titles, but avoid short
  // generic aliases such as "nama" matching "Nama Asesor".
  for (let index = 0; index < normalizedHeaders.length; index++) {
    const header = normalizedHeaders[index];
    const alias = normalizedAliases.find((candidate) => candidate.length >= 6 && header.includes(candidate));
    if (alias && row[index] !== undefined && row[index].trim() !== '') return row[index].trim();
  }
  return '';
}

/** Remove an official-question number before classifying a NIK header (for example, "23. NIK **"). */
function normalizeNIKHeader(header: string): string {
  const label = String(header ?? '').trim().replace(/^\s*(?:q(?:uestion)?\s*)?\d{1,2}\s*[.)\-:]\s*/i, '');
  return normalizeSheetHeader(label);
}
/** Returns whether a column header refers to the respondent's own NIK/KTP, not a relative or worker. */
export function isLikelyRespondentNIKHeader(header: string): boolean {
  const normalized = normalizeNIKHeader(header);
  if (!normalized) return false;

  // Never treat a photo/file upload column as an identity number, even if its
  // label contains "KTP" or "NIK".
  const documentWords = [
    'foto', 'photo', 'gambar', 'image', 'upload', 'unggah', 'dokumen',
    'lampiran', 'scan', 'file', 'tautan', 'link', 'drive',
  ];
  if (documentWords.some((word) => normalized.includes(word))) return false;

  // Exclude numbers belonging to relatives, staff, assessors, or emergency contacts.
  if (/(ayah|ibu|orangtua|wali|suami|istri|pasangan|keluarga|pendamping|petugas|asesor|asessor|supervisor|penanggungjawab|kontakdarurat)/.test(normalized)) {
    return false;
  }
  // "Nikah" and "teknik" are not identity-number headers.
  if (normalized.startsWith('nikah') || normalized.startsWith('teknik')) return false;

  const positivePatterns = [
    'nik',
    'nomorindukkependudukan',
    'noindukkependudukan',
    'indukkependudukan',
    'nomorkartutandapenduduk',
    'nokartutandapenduduk',
    'nomorktp',
    'noktp',
    'nomorktpnik',
    'noktpnik',
    'noindukpenduduk',
    'nomorindukpenduduk',
    'nikppks',
    'nikcalonresponden',
    'ktpnik',
    'ktpresponden',
    'ktppks',
    'nikresponden',
    'nikppks',
    'nikcalonresponden',
    'ektp',
    'noidentitas',
    'nomoridentitas',
    'identitasresponden',
    'nokependudukan',
    'nomorkependudukan',
    'nomoridentitaspenduduk',
    'kartutandapenduduk',
  ];
  return positivePatterns.some((pattern) =>
    pattern === 'nik'
      ? normalized === 'nik' || normalized.startsWith('nik') || normalized.includes('nomornik') || normalized.includes('nikresponden') || normalized.includes('nikppks') || normalized.includes('nikcalonresponden')
      : normalized.includes(pattern)
  );
}

/** NIK is an identity string, never a numeric calculation. Preserve text zeros,
 * reject rounded scientific notation, and only return validated 16-digit values. */
function normalizeNIKCellValue(value: string): string {
  // A NIK is an identifier, not a number. Preserve leading zeroes, accept a
  // single 16-digit run even if a form label surrounds it, and never infer
  // missing digits from scientific notation or a rounded numeric cell.
  const raw = String(value ?? '').trim().replace(/^['"`]/, '').replace(/\.0+$/, '');
  if (!raw) return '';
  if (/^[+-]?\d+(?:[.,]\d+)?e[+-]?\d+$/i.test(raw)) return '';

  // Supports separated display formats only if the combined digit count is
  // exactly 16; no zero-padding or guessed digit is ever added.
  const digits = raw.replace(/\D/g, '');
  if (/^\d{16}$/.test(digits)) return digits;

  // A label may contain its own number. Accept only one explicit, contiguous
  // 16-digit sequence in that case, otherwise leave NIK blank for diagnosis.
  const matches = [...raw.matchAll(/\d{16}/g)].map((match) => match[0]);
  return matches.length === 1 ? matches[0] : '';
}
/** Maps respondent NIK from descriptive Google Forms/Sheets headers. */
export function readNIKFromSheetRow(headers: string[], row: string[]): string {
  const candidates = headers
    .map((header, index) => ({
      header: String(header ?? '').trim(),
      normalized: normalizeNIKHeader(String(header ?? '')),
      value: String(row[index] ?? '').trim(),
      index,
    }))
    .filter(({ header, normalized, value }) => value && normalized && isLikelyRespondentNIKHeader(header));

  const score = (header: string): number => {
    const normalized = normalizeNIKHeader(header);
    let points = 0;
    if (normalized === 'nik' || normalized === 'nomorktp' || normalized === 'noktp' ||
        normalized === 'nomorindukkependudukan' || normalized === 'nokartutandapenduduk') points += 120;
    if (normalized.includes('responden') || normalized.includes('ppks') || normalized.includes('calonresponden')) points += 60;
    if (normalized.includes('nik')) points += 35;
    if (normalized.includes('ktp')) points += 25;
    if (normalized.includes('nomorindukkependudukan')) points += 20;
    if (/(ayah|ibu|orangtua|wali|suami|istri|pasangan|keluarga|pendamping|petugas|asesor|asessor|supervisor|penanggungjawab|kontakdarurat)/.test(normalized)) points -= 1000;
    if (normalized.length > 100) points -= 10;
    return points;
  };

  // Duplicate Forms headings can occur; use the strongest respondent-specific header
  // and keep iterating if its value is blank or not a valid 16-digit NIK.
  candidates.sort((a, b) => score(b.header) - score(a.header) || a.index - b.index);
  for (const candidate of candidates) {
    const nik = normalizeNIKCellValue(candidate.value);
    if (nik) return nik;
  }
  return '';
}

function parseSheetNumber(value: string, fallback = 0): number {
  const normalized = String(value ?? '').replace(/,/g, '.').replace(/[^\d.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseSheetBoolean(value: string): boolean {
  return /^(1|true|ya|yes|iya|setuju|direkomendasikan|perlu|ada)$/i.test(value.trim());
}

const INTEGRATED_SHEET_FIELDS: Array<{
  key: keyof IntegratedFormData;
  aliases: string[];
  kind?: 'number' | 'boolean';
}> = [
  { key: 'nomorRegistrasi', aliases: ['nomorRegistrasi', 'nomorRegistrasiPPKS', 'registrationNumber'] },
  { key: 'noBpjs', aliases: ['noBPJS', 'nomorBPJS', 'nomorJKN'] },
  { key: 'statusPernikahan', aliases: ['statusPernikahan', 'statusPerkawinan'] },
  { key: 'pendidikanTerakhir', aliases: ['pendidikanTerakhir', 'pendidikan'] },
  { key: 'pekerjaan', aliases: ['pekerjaan', 'pekerjaanSaatIni'] },
  { key: 'kontakDaruratNama', aliases: ['kontakDaruratNama', 'namaKontakDarurat'] },
  { key: 'kontakDaruratHubungan', aliases: ['kontakDaruratHubungan', 'hubunganKontakDarurat'] },
  { key: 'kontakDaruratNoHp', aliases: ['kontakDaruratNoHp', 'nomorKontakDarurat'] },
  { key: 'tahunDiagnosa', aliases: ['tahunDiagnosa', 'tahunDiagnosis', 'tahunDidiagnosis'] },
  { key: 'faskesPdpRujukan', aliases: ['faskesPdpRujukan', 'fasilitasKesehatanPDP', 'faskesRujukan'] },
  { key: 'statusArv', aliases: ['statusArv', 'statusARV'] },
  { key: 'regimenArv', aliases: ['regimenArv', 'regimenARV'] },
  { key: 'kepatuhanArv', aliases: ['kepatuhanArv', 'kepatuhanARV'] },
  { key: 'nilaiCd4Terakhir', aliases: ['nilaiCd4Terakhir', 'CD4Terakhir', 'hasilCD4'] },
  { key: 'viralLoadTerakhir', aliases: ['viralLoadTerakhir', 'viralLoad', 'hasilViralLoad'] },
  { key: 'riwayatInfeksiOportunistik', aliases: ['riwayatInfeksiOportunistik', 'infeksiOportunistik'] },
  { key: 'kendalaAksesPengobatan', aliases: ['kendalaAksesPengobatan', 'kendalaBerobat'] },
  { key: 'statusKeterbukaanStatus', aliases: ['statusKeterbukaanStatus', 'keterbukaanStatus'] },
  { key: 'dukunganKeluarga', aliases: ['dukunganKeluarga', 'dukunganKeluargaODHIV'] },
  { key: 'pengalamanStigmaDiskriminasi', aliases: ['pengalamanStigmaDiskriminasi', 'stigmaDiskriminasi'] },
  { key: 'kondisiTempatTinggal', aliases: ['kondisiTempatTinggal', 'statusTempatTinggal'] },
  { key: 'kondisiKelayakanRumah', aliases: ['kondisiKelayakanRumah', 'kelayakanRumah', 'kondisiRumah'] },
  { key: 'penghasilanBulanan', aliases: ['penghasilanBulanan', 'pendapatanBulanan'] },
  { key: 'pengeluaranKebutuhanObatNutrisi', aliases: ['pengeluaranKebutuhanObatNutrisi', 'pengeluaranObatNutrisi'] },
  { key: 'tanggunganKeluarga', aliases: ['tanggunganKeluarga', 'jumlahTanggungan'], kind: 'number' },
  { key: 'kepemilikanUsaha', aliases: ['kepemilikanUsaha', 'usahaDimiliki'] },
  { key: 'minatKeterampilanAtensi', aliases: ['minatKeterampilanAtensi', 'minatKeterampilan', 'jenisBantuanAtensi'] },
  { key: 'desilKemiskinan', aliases: ['desilKemiskinan', 'desilDTKS', 'desilEkonomi'], kind: 'number' },
  { key: 'skorKecemasan', aliases: ['skorKecemasan', 'tingkatKecemasan', 'hasilAsesmenKecemasan'] },
  { key: 'skorDepresi', aliases: ['skorDepresi', 'tingkatDepresi', 'hasilAsesmenDepresi'] },
  { key: 'penerimaanDiri', aliases: ['penerimaanDiri', 'penerimaanStatus'] },
  { key: 'doronganBunuhDiri', aliases: ['doronganBunuhDiri', 'ideBunuhDiri'] },
  { key: 'kebutuhanKonselingSosial', aliases: ['kebutuhanKonselingSosial', 'kebutuhanKonseling'] },
  { key: 'rekomendasiBantuanNutrisi', aliases: ['rekomendasiBantuanNutrisi', 'bantuanNutrisi'], kind: 'boolean' },
  { key: 'rekomendasiBantuanModalUsaha', aliases: ['rekomendasiBantuanModalUsaha', 'bantuanModalUsaha'], kind: 'boolean' },
  { key: 'rekomendasiBantuanMedisTransport', aliases: ['rekomendasiBantuanMedisTransport', 'bantuanMedisTransport'], kind: 'boolean' },
  { key: 'rekomendasiRujukanRehabilitasi', aliases: ['rekomendasiRujukanRehabilitasi', 'rujukanRehabilitasi'], kind: 'boolean' },
  { key: 'catatanIntervensiKhusus', aliases: ['catatanIntervensiKhusus', 'intervensiKhusus'] },
  { key: 'rencanaAksiPendamping', aliases: ['rencanaAksiPendamping', 'rencanaAksi'] },
  { key: 'jadwalMonitoringBerikutnya', aliases: ['jadwalMonitoringBerikutnya', 'jadwalMonitoring'] },
  { key: 'namaAsesor', aliases: ['namaAsesor', 'petugasAsesmen'] },
  { key: 'nipAsesor', aliases: ['nipAsesor', 'NIPAsesor'] },
  { key: 'supervisorKemensos', aliases: ['supervisorKemensos', 'namaSupervisor'] },
];

function mapRowsToPPKSRecords(rows: string[][]): PPKSRecord[] {
  if (rows.length < 2) return [];
  const headers = rows[0].map((value) => String(value ?? '').trim());
  if (!headers.some(Boolean)) return [];
  const records: PPKSRecord[] = [];
  const seen = new Set<string>();

  rows.slice(1).forEach((sourceRow, rowIndex) => {
    const row = sourceRow.map((value) => String(value ?? '').trim());
    const namaLengkap = readRespondentName(headers, row);
    if (!namaLengkap) return;

    const timestamp = readCellByAliases(headers, row, ['timestamp', 'capWaktu', 'waktuPengiriman', 'waktuPengisian', 'tanggalWaktu', 'createTime']);
    let nik = readNIKFromSheetRow(headers, row);
    // Google Forms can append helper text/asterisks and may label the NIK as
    // "NIK / No. KTP", "Nomor KTP (16 digit)" or a numbered official-PDF field.
    // Use a second conservative pass over respondent identity headers before
    // mapping the canonical answer, without ever treating a photo-upload column as NIK.
    if (!nik) {
      const identityCandidates = headers
        .map((header, index) => ({ header: String(header ?? ''), value: String(row[index] ?? '').trim() }))
        .filter(({ header, value }) =>
          value &&
          !/(foto|photo|gambar|image|upload|unggah|lampiran|scan|dokumen|berkas|file|tautan|linkdrive)/i.test(header) &&
          isLikelyRespondentNIKHeader(header)
        )
        .sort((a, b) => {
          const score = (header: string) => {
            const h = normalizeNIKHeader(header);
            return (h === 'nik' ? 100 : 0) +
              (h.includes('nomorindukkependudukan') ? 80 : 0) +
              (h.includes('responden') || h.includes('ppks') ? 40 : 0) +
              (h.includes('ktp') ? 20 : 0) -
              (/(ayah|ibu|wali|suami|istri|keluarga|pendamping|petugas|asesor)/i.test(h) ? 1000 : 0);
          };
          return score(b.header) - score(a.header);
        });
      for (const candidate of identityCandidates) {
        const normalized = normalizeNIKCellValue(candidate.value);
        if (normalized) { nik = normalized; break; }
      }
    }
    // Preserve answers from a spreadsheet whose headers are numbered like the official PDF.
    // For unnumbered Google Forms headers, resolve the unambiguous identity fields explicitly.
    const officialAssessment: Record<string, string | string[]> = {};
    headers.forEach((header, columnIndex) => {
      const label = String(header ?? '').trim();
      const value = String(row[columnIndex] ?? '').trim();
      if (!value) return;
      const numbered = label.match(/^\s*(?:q(?:uestion)?\s*)?(\d{1,2})\s*[.)\-:]\s*/i);
      const questionNumber = numbered ? Number(numbered[1]) : 0;
      if (questionNumber >= 1 && questionNumber <= 91) {
        officialAssessment['q' + questionNumber] = value;
        return;
      }
      const normalized = normalizeSheetHeader(label);
      if (normalized === 'nik' || normalized === 'nikresponden' || normalized === 'nikppks' || normalized === 'nomorindukkependudukan' || normalized === 'nomorktp' || normalized === 'noktp') {
        officialAssessment.q23 = nik || value;
      } else if (normalized === 'namalengkap' || normalized === 'namaresponden' || normalized === 'namappks') {
        officialAssessment.q16 = value;
      }
    });
    // Official question 23 is the canonical respondent NIK field in the
    // integrated assessment. Prefer it over generic NIK/KTP header scoring,
    // which may otherwise select a secondary identity-number column.
    const officialQ23NIK = typeof officialAssessment.q23 === 'string'
      ? normalizeNIKCellValue(officialAssessment.q23)
      : '';
    if (officialQ23NIK) {
      nik = officialQ23NIK;
      officialAssessment.q23 = officialQ23NIK;
    } else if (!nik && typeof officialAssessment.q23 === 'string') {
      nik = normalizeNIKCellValue(officialAssessment.q23);
      if (nik) officialAssessment.q23 = nik;
    } else if (nik && !String(officialAssessment.q23 ?? '').trim()) {
      // Preserve the recognized respondent NIK for forms without numbered Q23.
      officialAssessment.q23 = nik;
    }
    // Use only fields that identify a specific submission, not a generic "ID"
    // or NIK that may be repeated across multiple submitted rows.
    const externalId = readCellByAliases(headers, row, [
      'formResponseId', 'responseId', 'responseID', 'submissionId', 'idSubmission', 'idRespon',
    ]);
    const stableSource = [timestamp, nik, normalizeSheetHeader(namaLengkap), `row:${rowIndex + 2}`].join('|');
    let hash = 2166136261;
    for (let i = 0; i < stableSource.length; i++) {
      hash ^= stableSource.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const baseRecordId = externalId
      ? `SHEET-RESP-${externalId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80)}`
      : `SHEET-${(hash >>> 0).toString(36)}`;
    // Never drop an otherwise valid row because a source ID is repeated.
    // A collision receives a stable row-position suffix and is still counted.
    let recordId = baseRecordId;
    if (seen.has(recordId)) recordId = `${baseRecordId}-ROW-${rowIndex + 2}`;
    let collisionSuffix = 2;
    while (seen.has(recordId)) {
      recordId = `${baseRecordId}-ROW-${rowIndex + 2}-${collisionSuffix++}`;
    }
    seen.add(recordId);

    const usia = parseSheetNumber(readCellByAliases(headers, row, ['usia', 'umur', 'umurTahun', 'usiaSaatIni', 'umurSaatIni']), 0);
    const gender = readCellByAliases(headers, row, ['jenisKelamin', 'gender', 'jenisKelaminResponden']);
    const domisili = readCellByAliases(headers, row, ['kotaDomisili', 'kabupatenKota', 'kotaKabupaten', 'domisili', 'kota', 'kabupaten']);
    const alamat = readCellByAliases(headers, row, ['alamatLengkap', 'alamatDomisili', 'alamatResponden', 'alamat']);
    const jenisBantuan = readCellByAliases(headers, row, ['jenisBantuan', 'bantuanDibutuhkan', 'jenisBantuanAtensi', 'kebutuhanBantuan']);
    const integratedValues: Partial<Record<keyof IntegratedFormData, string | number | boolean>> = {};
    const integratedMarkerKeys = new Set<keyof IntegratedFormData>([
      'nomorRegistrasi', 'noBpjs', 'tahunDiagnosa', 'faskesPdpRujukan',
      'statusArv', 'nilaiCd4Terakhir', 'viralLoadTerakhir',
      'kontakDaruratNama', 'statusKeterbukaanStatus',
    ]);
    let hasIntegratedAssessmentData = false;
    for (const field of INTEGRATED_SHEET_FIELDS) {
      const rawValue = readCellByAliases(headers, row, field.aliases);
      if (rawValue && integratedMarkerKeys.has(field.key)) hasIntegratedAssessmentData = true;
      if (field.kind === 'number') integratedValues[field.key] = parseSheetNumber(rawValue, 0);
      else if (field.kind === 'boolean') integratedValues[field.key] = parseSheetBoolean(rawValue);
      else integratedValues[field.key] = rawValue;
    }

    const integratedForm = hasIntegratedAssessmentData
      ? (integratedValues as IntegratedFormData)
      : undefined;
    const desil = parseSheetNumber(readCellByAliases(headers, row, ['desil', 'desilKemiskinan', 'desilDTKS', 'desilEkonomi']), 0);
    // Prefer category-aware upload-column detection so a longer Google Forms
    // question title still maps correctly, while never treating KTP/KK/house
    // attachments as the respondent portrait.
    const fotoDiri = normalizePPKSPhotoSource(
      readPPKSPhotoSourceByKind(headers, row, 'diri') ||
      readCellByAliases(headers, row, ['fotoDiri', 'fotoDiriPPKS', 'fotoResponden', 'uploadFotoDiri', 'tautanFotoDiri', 'linkFotoDiri', 'fotoDiriCloseUp', 'fotoDiriResponden'])
    );
    const fotoKtp = normalizePPKSPhotoSource(
      readPPKSPhotoSourceByKind(headers, row, 'ktp') ||
      readCellByAliases(headers, row, ['fotoKtp', 'fotoKTP', 'uploadFotoKTP', 'dokumenKTP', 'tautanFotoKTP', 'linkFotoKTP', 'fotoKartuIdentitas', 'scanKTP'])
    );
    const fotoKk = normalizePPKSPhotoSource(
      readPPKSPhotoSourceByKind(headers, row, 'kk') ||
      readCellByAliases(headers, row, ['fotoKk', 'fotoKK', 'uploadFotoKK', 'dokumenKK', 'tautanFotoKK', 'linkFotoKK', 'scanKK'])
    );
    const fotoRumah = normalizePPKSPhotoSource(
      readPPKSPhotoSourceByKind(headers, row, 'rumah') ||
      readCellByAliases(headers, row, ['fotoRumah', 'fotoRumahTampakDepan', 'uploadFotoRumah', 'tautanFotoRumah', 'linkFotoRumah', 'fotoDepanRumah', 'fotoTampakDepanRumah'])
    );
    const sourceRecord: PPKSRecord = {
      id: recordId || `SHEET-ROW-${rowIndex + 2}`,
      timestamp,
      namaLengkap,
      nik,
      usia,
      jenisKelamin: /perempuan|wanita/i.test(gender) ? 'Perempuan' : 'Laki-laki',
      kotaDomisili: domisili,
      alamatLengkap: alamat,
      noHpWa: readCellByAliases(headers, row, ['noHPWA', 'nomorHPWA', 'noWhatsApp', 'nomorTelepon', 'telepon', 'hp']),
      jenisBantuan,
      intervensiMental: readCellByAliases(headers, row, ['intervensiMental', 'kebutuhanIntervensiMental', 'catatanPendamping']),
      desil,
      fotoDiri,
      fotoKtp,
      fotoKk,
      fotoRumah,
      statusAsesmen: integratedForm ? 'Terintegrasi' : 'Tahap Awal',
      googleFormSync: true,
      integratedForm,
      officialAssessment: Object.keys(officialAssessment).length ? officialAssessment : undefined,
    };
    records.push(sourceRecord);
  });
  return sortPPKSRecordsByTimestamp(records);
}

interface GoogleFormPhotoMetadata {
  formId?: string;
  linkedSheetId?: string;
  info?: { title?: string; documentTitle?: string };
  items?: Array<{
    title?: string;
    questionItem?: {
      question?: {
        questionId?: string;
        fileUploadQuestion?: Record<string, unknown>;
      };
    };
  }>;
}
type PhotoRecoveryStatus =
  | 'not-needed'
  | 'recovered'
  | 'no-linked-form'
  | 'no-upload-responses'
  | 'no-match'
  | 'failed'
  | 'not-applicable';

interface PhotoRecoveryDiagnostics {
  status: PhotoRecoveryStatus;
  formTitle: string;
  responseCount: number;
  responsesWithUploads: number;
  recordsMatched: number;
  linksRecovered: number;
  detail: string;
}

interface CachedGoogleFormPhotoResponses {
  formId: string;
  loadedAt: number;
  formTitle: string;
  totalResponses: number;
  candidates: FormPhotoResponseCandidate[];
}
let cachedGoogleFormPhotoResponses: CachedGoogleFormPhotoResponses | null = null;
let googleFormPhotoResponsesInFlight: Promise<CachedGoogleFormPhotoResponses> | null = null;

function normalizeFormName(value: string): string {
  return normalizeSheetHeader(value)
    .replace(/(responses?|answers?|jawaban|tanggapan|responseform|responsesheet)$/g, '');
}

function scoreFormNameMatch(spreadsheetTitle: string, formFileName: string): number {
  const sheetStem = normalizeFormName(spreadsheetTitle);
  const formStem = normalizeFormName(formFileName);
  if (!sheetStem || !formStem) return 0;
  if (sheetStem === formStem) return 1000;
  if (sheetStem.startsWith(formStem) || formStem.startsWith(sheetStem)) {
    return 600 + Math.min(sheetStem.length, formStem.length);
  }
  const sheetTokens = new Set(spreadsheetTitle.toLocaleLowerCase('id-ID').match(/[a-z0-9]+/g) || []);
  const formTokens = new Set(formFileName.toLocaleLowerCase('id-ID').match(/[a-z0-9]+/g) || []);
  for (const token of ['responses', 'response', 'jawaban', 'tanggapan', 'form', 'google', 'sheet', 'sheets']) {
    sheetTokens.delete(token);
    formTokens.delete(token);
  }
  const shared = [...sheetTokens].filter((token) => formTokens.has(token)).length;
  return shared * 10;
}

/**
 * Resolve the actual Google Form connected to this source spreadsheet. Earlier
 * code always read the hard-coded SIPANDU form, even when the configured response
 * sheet belonged to another form. linkedSheetId is the authoritative relationship.
 */
async function resolveFormLinkedToSpreadsheet(
  spreadsheetId: string,
  spreadsheetTitle: string,
  preferredFormId: string,
): Promise<GoogleFormPhotoMetadata | null> {
  const inspected = new Map<string, GoogleFormPhotoMetadata | null>();
  const inspect = async (formId: string): Promise<GoogleFormPhotoMetadata | null> => {
    if (!formId || inspected.has(formId)) return inspected.get(formId) || null;
    try {
      const form = await googleJson<GoogleFormPhotoMetadata>(
        `https://forms.googleapis.com/v1/forms/${extractFormId(formId)}`
      );
      if (isGoogleFormLinkedToSpreadsheet(form.linkedSheetId, spreadsheetId)) {
        inspected.set(formId, form);
        return form;
      }
      // Trust this configured ID pair only if legacy metadata omits linkedSheetId;
      // never do this for a different custom spreadsheet.
      if (
        !form.linkedSheetId &&
        spreadsheetId === GOOGLE_SIPANDU_RESOURCES.responseSpreadsheetId &&
        formId === GOOGLE_SIPANDU_RESOURCES.formId
      ) {
        inspected.set(formId, form);
        return form;
      }
      inspected.set(formId, null);
    } catch (error) {
      console.warn('SIPANDU could not inspect Google Form metadata:', error);
      inspected.set(formId, null);
    }
    return null;
  };

  const preferred = await inspect(preferredFormId);
  if (preferred) return preferred;

  const words = (spreadsheetTitle.match(/[A-Za-z0-9]+/g) || [])
    .filter((word) => word.length >= 5)
    .filter((word) => !/^(responses?|answers?|jawaban|tanggapan|spreadsheet|google|forms?)$/i.test(word));
  const probes = [...new Set(words)].slice(0, 4);
  const driveForms = new Map<string, { id: string; name: string }>();

  // Search Drive for candidate Form files, then confirm the exact linkedSheetId
  // with Forms API; a similar title alone is never treated as proof of a link.
  for (const word of probes) {
    const escapedWord = word.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const params = new URLSearchParams({
      q: `mimeType = 'application/vnd.google-apps.form' and trashed = false and name contains '${escapedWord}'`,
      pageSize: '100',
      orderBy: 'name',
      fields: 'nextPageToken,files(id,name,mimeType)',
    });
    let pageToken = '';
    let pages = 0;
    do {
      if (pageToken) params.set('pageToken', pageToken);
      const response = await googleJson<{
        files?: Array<{ id?: string; name?: string; mimeType?: string }>;
        nextPageToken?: string;
      }>(`https://www.googleapis.com/drive/v3/files?${params.toString()}`);
      for (const file of response.files || []) {
        if (file.id && file.mimeType === 'application/vnd.google-apps.form') {
          driveForms.set(file.id, { id: file.id, name: String(file.name || '') });
        }
      }
      pageToken = response.nextPageToken || '';
      pages++;
    } while (pageToken && pages < 3);
  }

  const ranked = [...driveForms.values()]
    .map((file) => ({ ...file, score: scoreFormNameMatch(spreadsheetTitle, file.name) }))
    .filter((file) => file.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 15);
  for (const candidate of ranked) {
    const form = await inspect(candidate.id);
    if (form && isGoogleFormLinkedToSpreadsheet(form.linkedSheetId, spreadsheetId)) return form;
    if (form && !form.linkedSheetId &&
        spreadsheetId === GOOGLE_SIPANDU_RESOURCES.responseSpreadsheetId &&
        candidate.id === GOOGLE_SIPANDU_RESOURCES.formId) return form;
  }
  return null;
}

async function loadGoogleFormPhotoResponseCandidates(
  form: GoogleFormPhotoMetadata,
): Promise<CachedGoogleFormPhotoResponses> {
  const formId = String(form.formId || '').trim();
  if (!formId) throw new Error('Metadata Google Form tertaut tidak memiliki formId.');
  if (
    cachedGoogleFormPhotoResponses &&
    cachedGoogleFormPhotoResponses.formId === formId &&
    Date.now() - cachedGoogleFormPhotoResponses.loadedAt < 5 * 60 * 1000
  ) return cachedGoogleFormPhotoResponses;
  if (googleFormPhotoResponsesInFlight) return googleFormPhotoResponsesInFlight;

  const operation = (async (): Promise<CachedGoogleFormPhotoResponses> => {
    const kindByQuestionId = new Map<string, ReturnType<typeof classifyPPKSPhotoHeader>>();
    const nameQuestionIds = new Set<string>();
    const nikQuestionIds = new Set<string>();
    for (const item of form.items || []) {
      const question = item.questionItem?.question;
      const questionId = String(question?.questionId || '').trim();
      const title = String(item.title || '').trim();
      if (!questionId || !title) continue;
      if (question?.fileUploadQuestion) {
        const kind = classifyPPKSPhotoHeader(title);
        if (kind) kindByQuestionId.set(questionId, kind);
      }
      const normalizedTitle = normalizeSheetHeader(title);
      if (
        /nama/.test(normalizedTitle) &&
        !/(asesor|asessor|petugas|pendamping|supervisor|ayah|ibu|wali|pasangan|suami|istri|kontakdarurat|penanggungjawab)/.test(normalizedTitle)
      ) nameQuestionIds.add(questionId);
      if (isLikelyRespondentNIKHeader(title)) nikQuestionIds.add(questionId);
    }

    const responses = await fetchFormResponses(formId);
    const candidates: FormPhotoResponseCandidate[] = responses.map((response) => {
      const photos: FormPhotoResponseCandidate['photos'] = {};
      let respondentName = '';
      let respondentNIK = '';
      for (const [questionId, answer] of Object.entries(response.answers || {})) {
        if (nameQuestionIds.has(questionId) && !respondentName) {
          respondentName = (answer.textAnswers?.answers || [])
            .map((entry) => String(entry.value || '').trim())
            .find(Boolean) || '';
        }
        if (nikQuestionIds.has(questionId) && !respondentNIK) {
          respondentNIK = (answer.textAnswers?.answers || [])
            .map((entry) => normalizeNIKCellValue(String(entry.value || '')))
            .find(Boolean) || '';
        }
        const kind = kindByQuestionId.get(questionId);
        if (!kind || photos[kind]) continue;
        const file = (answer.fileUploadAnswers?.answers || []).find((entry) => entry.fileId);
        if (file?.fileId) photos[kind] = googleDriveViewUrl(file.fileId);
      }
      return {
        responseId: response.responseId,
        timestamp: response.createTime || response.lastSubmittedTime || '',
        respondentName,
        respondentNIK,
        photos,
      };
    }).filter((candidate) => Object.values(candidate.photos).some(Boolean));

    return {
      formId,
      loadedAt: Date.now(),
      formTitle: String(form.info?.title || form.info?.documentTitle || 'Google Form tertaut'),
      totalResponses: responses.length,
      candidates,
    };
  })();
  googleFormPhotoResponsesInFlight = operation;
  try {
    const result = await operation;
    cachedGoogleFormPhotoResponses = result;
    return result;
  } finally {
    googleFormPhotoResponsesInFlight = null;
  }
}

async function recoverPhotosFromGoogleForms(
  records: PPKSRecord[],
  spreadsheetId: string,
  spreadsheetTitle: string,
  preferredFormId: string,
): Promise<{ records: PPKSRecord[]; diagnostics: PhotoRecoveryDiagnostics }> {
  const missingPhotos = records.some((record) =>
    !normalizePPKSPhotoSource(record.fotoDiri) ||
    !normalizePPKSPhotoSource(record.fotoKtp) ||
    !normalizePPKSPhotoSource(record.fotoKk) ||
    !normalizePPKSPhotoSource(record.fotoRumah)
  );
  if (!missingPhotos || !records.length) {
    return {
      records,
      diagnostics: {
        status: 'not-needed', formTitle: '', responseCount: 0,
        responsesWithUploads: 0, recordsMatched: 0, linksRecovered: 0,
        detail: 'Semua foto pada sumber spreadsheet sudah memiliki tautan.',
      },
    };
  }

  const form = await resolveFormLinkedToSpreadsheet(spreadsheetId, spreadsheetTitle, preferredFormId);
  if (!form) {
    return {
      records,
      diagnostics: {
        status: 'no-linked-form', formTitle: '', responseCount: 0,
        responsesWithUploads: 0, recordsMatched: 0, linksRecovered: 0,
        detail: 'Tidak ditemukan Google Form dengan linkedSheetId yang sama dengan spreadsheet sumber.',
      },
    };
  }

  const responseData = await loadGoogleFormPhotoResponseCandidates(form);
  if (!responseData.candidates.length) {
    return {
      records,
      diagnostics: {
        status: 'no-upload-responses', formTitle: responseData.formTitle,
        responseCount: responseData.totalResponses, responsesWithUploads: 0,
        recordsMatched: 0, linksRecovered: 0,
        detail: 'Form tertaut ditemukan, tetapi API tidak mengembalikan respons yang berisi unggahan foto.',
      },
    };
  }

  let linksRecovered = 0;
  let recordsMatched = 0;
  const enriched = records.map((record) => {
    const currentDiri = normalizePPKSPhotoSource(record.fotoDiri);
    const currentKtp = normalizePPKSPhotoSource(record.fotoKtp);
    const currentKk = normalizePPKSPhotoSource(record.fotoKk);
    const currentRumah = normalizePPKSPhotoSource(record.fotoRumah);
    if (currentDiri && currentKtp && currentKk && currentRumah) return {
      ...record, fotoDiri: currentDiri, fotoKtp: currentKtp, fotoKk: currentKk, fotoRumah: currentRumah,
    };
    const sourceNIK = String(record.officialAssessment?.q23 || record.nik || '');
    const match = matchFormPhotoResponseForPPKS(
      record.namaLengkap,
      record.timestamp,
      responseData.candidates,
      3 * 60 * 1000,
      sourceNIK,
    );
    if (!match) return {
      ...record,
      fotoDiri: currentDiri, fotoKtp: currentKtp, fotoKk: currentKk, fotoRumah: currentRumah,
    };
    recordsMatched++;
    const updated: PPKSRecord = {
      ...record,
      fotoDiri: currentDiri || match.photos.diri || '',
      fotoKtp: currentKtp || match.photos.ktp || '',
      fotoKk: currentKk || match.photos.kk || '',
      fotoRumah: currentRumah || match.photos.rumah || '',
    };
    if (!currentDiri && updated.fotoDiri) linksRecovered++;
    if (!currentKtp && updated.fotoKtp) linksRecovered++;
    if (!currentKk && updated.fotoKk) linksRecovered++;
    if (!currentRumah && updated.fotoRumah) linksRecovered++;
    return updated;
  });

  const diagnostics: PhotoRecoveryDiagnostics = {
    status: linksRecovered > 0 ? 'recovered' : 'no-match',
    formTitle: responseData.formTitle,
    responseCount: responseData.totalResponses,
    responsesWithUploads: responseData.candidates.length,
    recordsMatched,
    linksRecovered,
    detail: `${responseData.formTitle}: ${responseData.totalResponses} respons, ${responseData.candidates.length} respons dengan unggahan foto, ${recordsMatched} PPKS cocok, ${linksRecovered} tautan foto dipulihkan.`,
  };
  return { records: enriched, diagnostics };
}

/** Imports respondent records from an authorized spreadsheet without writing to the source. */
export async function importPPKSFromSpreadsheet(
  spreadsheetUrlOrId: string,
  preferredTab?: string,
): Promise<{
  spreadsheetId: string;
  spreadsheetTitle: string;
  sheetTitles: string[];
  selectedTab: string;
  rowsRead: number;
  sourceDataRows: number;
  sourceRowsWithName: number;
  rowsWithoutRecognizedName: number;
  recordsBeforeDemoFilter: number;
  sampleRecordsFiltered: number;
  duplicateRowsCollapsed: number;
  photosRecoveredFromForm: number;
  photoRecoveryStatus: PhotoRecoveryStatus;
  photoRecoveryDetail: string;
  photoRecoveryDiagnostics: { responseCount: number; responsesWithUploads: number; recordsMatched: number };
  photoCounts: { diri: number; ktp: number; kk: number; rumah: number };
  records: PPKSRecord[];
  recordsWithNIK: number;
  recordsMissingNIK: number;
  nikHeadersFound: string[];
  /** Counts only; never returns actual NIK values in diagnostics. */
  nikColumnDiagnostics: Array<{
    header: string;
    nonEmptyValues: number;
    validNIKValues: number;
    scientificNotationValues: number;
  }>;
  previewRows: string[][];
}> {
  const metadata = await getSpreadsheetMetadata(spreadsheetUrlOrId);
  if (!metadata.sheetTitles.length) throw new Error('Spreadsheet tidak memiliki tab yang dapat dibaca.');
  const preferred = preferredTab?.trim();
  const responseTab = metadata.sheetTitles.find((title) => {
    const normalized = normalizeSheetHeader(title);
    return normalized.includes('formresponses') || normalized.includes('fromresponse') || normalized.includes('respon');
  });
  const selectedTab = preferred && metadata.sheetTitles.includes(preferred)
    ? preferred
    : (responseTab || metadata.sheetTitles[0]);
  const escapedTitle = selectedTab.replace(/'/g, "''");
  const rows = await readSpreadsheetRichData(metadata.spreadsheetId, `'${escapedTitle}'!A1:ZZ2000`);
  const headers = rows[0] || [];
  const dataRows = rows.slice(1);
  const sourceRowsWithName = dataRows.filter((row) => Boolean(readRespondentName(headers, row))).length;
  const allMappedRecords = mapRowsToPPKSRecords(rows);
  const recordsAfterSampleFilter = allMappedRecords.filter((record) => !isLegacySamplePPKS(record));
  let records = sortPPKSRecordsByTimestamp(deduplicatePPKSRecords(recordsAfterSampleFilter));
  const sampleRecordsFiltered = allMappedRecords.length - recordsAfterSampleFilter.length;
  const duplicateRowsCollapsed = recordsAfterSampleFilter.length - records.length;
  let photosRecoveredFromForm = 0;
  let photoRecoveryStatus: PhotoRecoveryStatus = 'not-applicable';
  let photoRecoveryDetail = 'Sumber ini tidak dikenali sebagai spreadsheet respons ATENSI; pemulihan Google Forms tidak dijalankan.';
  let photoRecoveryDiagnostics = { responseCount: 0, responsesWithUploads: 0, recordsMatched: 0 };

  const normalizedSpreadsheetTitle = normalizeSheetHeader(metadata.title);
  const normalizedSelectedTab = normalizeSheetHeader(selectedTab);
  const isKnownATENSIResponseSheet =
    metadata.spreadsheetId === GOOGLE_SIPANDU_RESOURCES.responseSpreadsheetId ||
    (
      normalizedSpreadsheetTitle.includes('asesmenprogramasistensirehabilitasisosial') &&
      normalizedSpreadsheetTitle.includes('responses') &&
      normalizedSelectedTab.includes('formresponses')
    );
  if (isKnownATENSIResponseSheet) {
    const hasMissingPhoto = records.some((record) =>
      !normalizePPKSPhotoSource(record.fotoDiri) ||
      !normalizePPKSPhotoSource(record.fotoKtp) ||
      !normalizePPKSPhotoSource(record.fotoKk) ||
      !normalizePPKSPhotoSource(record.fotoRumah)
    );
    if (hasMissingPhoto) {
      photoRecoveryStatus = 'no-match';
      photoRecoveryDetail = 'Mencari Google Form yang benar-benar tertaut ke spreadsheet sumber…';
      try {
        const recovery = await recoverPhotosFromGoogleForms(
          records,
          metadata.spreadsheetId,
          metadata.title,
          GOOGLE_SIPANDU_RESOURCES.formId,
        );
        records = recovery.records;
        photosRecoveredFromForm = recovery.diagnostics.linksRecovered;
        photoRecoveryStatus = recovery.diagnostics.status;
        photoRecoveryDetail = recovery.diagnostics.detail;
        photoRecoveryDiagnostics = {
          responseCount: recovery.diagnostics.responseCount,
          responsesWithUploads: recovery.diagnostics.responsesWithUploads,
          recordsMatched: recovery.diagnostics.recordsMatched,
        };
      } catch (error) {
        photoRecoveryStatus = 'failed';
        photoRecoveryDetail = `Google Forms tidak dapat dibaca: ${error instanceof Error ? error.message : String(error)}`;
        // Never fail importing the spreadsheet because the optional Forms fallback
        // is unavailable; the visible diagnostics explain why recovery failed.
        console.warn('SIPANDU photo recovery via the linked Google Form failed:', error);
      }
    } else {
      photoRecoveryStatus = 'not-needed';
      photoRecoveryDetail = 'Semua rekaman sudah memiliki tautan sumber foto.';
    }
  }
  const nikHeadersFound = headers.filter((header) => isLikelyRespondentNIKHeader(header)).map((header) => header.trim());
  const recordsWithNIK = records.filter((record) => Boolean(String(record.nik || '').trim())).length;
  // Diagnose the source headers and value quality without returning any actual NIK values.
  const nikColumnDiagnostics = headers
    .map((header, index) => ({ header: String(header || '').trim(), normalized: normalizeSheetHeader(String(header || '')), index }))
    .filter(({ normalized }) => /(nik|ktp|kependudukan|identitas|indukpenduduk|kartutandapenduduk)/.test(normalized))
    .slice(0, 20)
    .map(({ header, index }) => {
      const values = rows.slice(1).map((row) => String(row[index] ?? '').trim());
      return {
        header,
        nonEmptyValues: values.filter(Boolean).length,
        validNIKValues: values.filter((value) => Boolean(normalizeNIKCellValue(value))).length,
        scientificNotationValues: values.filter((value) => /^[+-]?\d+(?:[.,]\d+)?e[+-]?\d+$/i.test(value)).length,
      };
    });
  return {
    spreadsheetId: metadata.spreadsheetId,
    spreadsheetTitle: metadata.title,
    sheetTitles: metadata.sheetTitles,
    selectedTab,
    rowsRead: rows.length,
    sourceDataRows: dataRows.length,
    sourceRowsWithName,
    rowsWithoutRecognizedName: Math.max(0, dataRows.length - sourceRowsWithName),
    recordsBeforeDemoFilter: allMappedRecords.length,
    sampleRecordsFiltered,
    duplicateRowsCollapsed,
    records,
    recordsWithNIK,
    recordsMissingNIK: records.length - recordsWithNIK,
    photosRecoveredFromForm,
    photoRecoveryStatus,
    photoRecoveryDetail,
    photoRecoveryDiagnostics,
    photoCounts: {
      diri: records.filter((record) => Boolean(normalizePPKSPhotoSource(record.fotoDiri))).length,
      ktp: records.filter((record) => Boolean(normalizePPKSPhotoSource(record.fotoKtp))).length,
      kk: records.filter((record) => Boolean(normalizePPKSPhotoSource(record.fotoKk))).length,
      rumah: records.filter((record) => Boolean(normalizePPKSPhotoSource(record.fotoRumah))).length,
    },
    nikHeadersFound,
    nikColumnDiagnostics,
    previewRows: rows.slice(0, 8),
  };
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



/**
 * Clears only rows that clearly match retired demo respondent IDs/names or
 * explicit demo/sample markers in the row's ID/name columns. Every other row,
 * its formatting, and the sheet structure are preserved.
 */
export async function removeLegacyDemoRowsFromSpreadsheet(spreadsheetUrlOrId: string): Promise<{
  spreadsheetId: string;
  spreadsheetTitle: string;
  tabsScanned: number;
  rowsCleared: number;
  clearedRanges: string[];
}> {
  const metadata = await getSpreadsheetMetadata(spreadsheetUrlOrId);
  const rangesToClear: string[] = [];
  for (const title of metadata.sheetTitles) {
    const escapedTitle = title.replace(/'/g, "''");
    const rows = await readSpreadsheetData(metadata.spreadsheetId, `'${escapedTitle}'!A1:AZ2000`);
    if (rows.length < 2 || !rows[0].some((header) => header.trim())) continue;
    const headers = rows[0].map(normalizeSheetHeader);
    const idColumnIndexes = headers
      .map((header, index) => ({ header, index }))
      .filter(({ header }) => ['id', 'idppks', 'idresponden', 'recordid', 'nomorregistrasi', 'kodeppks'].includes(header))
      .map(({ index }) => index);
    const nameColumnIndexes = headers
      .map((header, index) => ({ header, index }))
      .filter(({ header }) =>
        ['namalengkap', 'namaresponden', 'namappks', 'namaodhiv', 'namacalonresponden'].includes(header) ||
        header.includes('namalengkapsesuaiktp') ||
        header.includes('namaresponden')
      )
      .map(({ index }) => index);

    rows.slice(1).forEach((row, index) => {
      const idMatch = idColumnIndexes.some((columnIndex) => {
        const value = String(row[columnIndex] || '').trim();
        return LEGACY_SAMPLE_PPKS_IDS.has(value) || isObviousDemoMarker(value);
      });
      const nameMatch = nameColumnIndexes.some((columnIndex) => {
        const value = String(row[columnIndex] || '').trim();
        return LEGACY_SAMPLE_PPKS_NAMES.has(value.toLocaleLowerCase('id-ID')) || isObviousDemoMarker(value);
      });
      const exactLegacyIdInAnyCell = row.some((cell) => LEGACY_SAMPLE_PPKS_IDS.has(String(cell || '').trim()));
      if (idMatch || nameMatch || exactLegacyIdInAnyCell) {
        const rowNumber = index + 2;
        rangesToClear.push(`'${escapedTitle}'!A${rowNumber}:ZZ${rowNumber}`);
      }
    });
  }

  if (rangesToClear.length) {
    await googleJson(
      `https://sheets.googleapis.com/v4/spreadsheets/${metadata.spreadsheetId}/values:batchClear`,
      { method: 'POST', body: JSON.stringify({ ranges: rangesToClear }) }
    );
  }
  return {
    spreadsheetId: metadata.spreadsheetId,
    spreadsheetTitle: metadata.title,
    tabsScanned: metadata.sheetTitles.length,
    rowsCleared: rangesToClear.length,
    clearedRanges: rangesToClear,
  };
}

function isObviousDemoDriveName(name: string): boolean {
  const normalized = normalizeSheetHeader(name);
  const exactLegacyArtifacts = [
    'Database_PPKS_ODHIV_Sumut_2026.xlsx',
    'SRT-ST-001',
    'SRT-BA-002',
    'SRT-SP-003',
    '1yA8KemensosODHIVSumut2026_LiveSync',
  ].map(normalizeSheetHeader);
  if (exactLegacyArtifacts.some((marker) => normalized.includes(marker))) return true;
  if ([...LEGACY_SAMPLE_PPKS_IDS].some((id) => normalized.includes(normalizeSheetHeader(id)))) return true;
  if ([...LEGACY_SAMPLE_PPKS_NAMES].some((sampleName) => normalized.includes(normalizeSheetHeader(sampleName)))) return true;
  return isObviousDemoMarker(name) ||
    /(^|[^a-z])(demo|sample|contoh|dummy|uji[\s_-]?coba|data[\s_-]?uji|uji[\s_-]?data|test[\s_-]?data)([^a-z]|$)/i.test(name);
}

/** Lists visible Drive metadata with pagination. Only filenames/IDs are used for demo-artifact detection. */
async function listAllVisibleDriveFiles(): Promise<GoogleDriveFile[]> {
  const files: GoogleDriveFile[] = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({
      q: 'trashed = false',
      pageSize: '1000',
      orderBy: 'modifiedTime desc',
      fields: 'nextPageToken,files(id,name,mimeType,webViewLink,createdTime)',
      corpora: 'user',
      includeItemsFromAllDrives: 'true',
      supportsAllDrives: 'true',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const page = await googleJson<{ files?: GoogleDriveFile[]; nextPageToken?: string }>(
      `https://www.googleapis.com/drive/v3/files?${params.toString()}`
    );
    files.push(...(page.files || []));
    pageToken = page.nextPageToken || '';
  } while (pageToken);
  return files;
}

/** Broad marker checks are permitted account-wide only when the file name identifies SIPANDU. */
function isSIPANDULegacyDriveArtifact(name: string): boolean {
  const normalized = normalizeSheetHeader(name);
  const exactArtifacts = [
    'Database_PPKS_ODHIV_Sumut_2026.xlsx',
    'SRT-ST-001',
    'SRT-BA-002',
    'SRT-SP-003',
    '1yA8KemensosODHIVSumut2026_LiveSync',
  ].map(normalizeSheetHeader);
  if (exactArtifacts.some((marker) => normalized.includes(marker))) return true;
  if ([...LEGACY_SAMPLE_PPKS_IDS].some((id) => normalized.includes(normalizeSheetHeader(id)))) return true;
  if ([...LEGACY_SAMPLE_PPKS_NAMES].some((sampleName) => normalized.includes(normalizeSheetHeader(sampleName)))) return true;
  const hasDemoMarker = /(^|[^a-z])(demo|sample|contoh|dummy|uji\s*coba|data\s*uji|uji\s*data|test\s*data|data\s*test)([^a-z]|$)/i.test(name);
  const identifiesSipandu = /(sipandu|ppks|odhiv|asesmen|kemensos)/i.test(name);
  return hasDemoMarker && identifiesSipandu;
}

async function listDriveChildren(parentId: string): Promise<GoogleDriveFile[]> {
  const files: GoogleDriveFile[] = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({
      q: `'${parentId}' in parents and trashed = false`,
      pageSize: '100',
      orderBy: 'name',
      fields: 'nextPageToken,files(id,name,mimeType,webViewLink,createdTime)',
      includeItemsFromAllDrives: 'true',
      supportsAllDrives: 'true',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const result = await googleJson<{ files?: GoogleDriveFile[]; nextPageToken?: string }>(
      `https://www.googleapis.com/drive/v3/files?${params.toString()}`
    );
    files.push(...(result.files || []));
    pageToken = result.nextPageToken || '';
  } while (pageToken);
  return files;
}

/**
 * Deletes clearly marked demo/sample files within the configured SIPANDU Drive
 * folder and files located under folders whose names explicitly mark them as
 * demo areas. Non-demo files elsewhere in the Drive are not touched.
 */
export async function removeObviousDemoFilesFromDrive(folderUrlOrId: string): Promise<{
  folderId: string;
  filesScanned: number;
  filesDeleted: number;
  deletedNames: string[];
  accountWideScanCompleted: boolean;
}> {
  const rootFolderId = extractDriveFolderId(folderUrlOrId);
  const discovered: GoogleDriveFile[] = [];
  const visitedFolders = new Set<string>();
  const scannedIds = new Set<string>();

  const visit = async (parentId: string, depth: number, insideMarkedDemoFolder = false): Promise<void> => {
    if (depth > 5 || visitedFolders.has(parentId)) return;
    visitedFolders.add(parentId);
    const children = await listDriveChildren(parentId);
    children.forEach((file) => scannedIds.add(file.id));
    for (const file of children) {
      const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
      if (isFolder) {
        await visit(file.id, depth + 1, insideMarkedDemoFolder || isObviousDemoDriveName(file.name));
      } else if (insideMarkedDemoFolder || isObviousDemoDriveName(file.name)) {
        discovered.push(file);
      }
    }
  };

  await visit(rootFolderId, 0);

  // Some retired examples were created outside the designated SIPANDU folder.
  // Scan metadata from the authorized account, but outside that folder only
  // delete specific legacy SIPANDU demo artifacts, never generic "test" files.
  let accountWideScanCompleted = false;
  try {
    const allVisible = await listAllVisibleDriveFiles();
    accountWideScanCompleted = true;
    allVisible.forEach((file) => scannedIds.add(file.id));
    for (const file of allVisible) {
      if (
        file.mimeType !== 'application/vnd.google-apps.folder' &&
        isSIPANDULegacyDriveArtifact(file.name)
      ) discovered.push(file);
    }
  } catch {
    // Preserve the folder cleanup if Google does not allow an account-wide scan.
    // The result tells the caller that global coverage was incomplete.
  }

  const unique = [...new Map(discovered.map((file) => [file.id, file])).values()];
  const deletedNames: string[] = [];
  for (const file of unique) {
    await googleJson(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?supportsAllDrives=true`,
      { method: 'DELETE' }
    );
    deletedNames.push(file.name);
  }
  return {
    folderId: rootFolderId,
    filesScanned: scannedIds.size,
    filesDeleted: deletedNames.length,
    deletedNames,
    accountWideScanCompleted,
  };
}
