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

export interface GoogleSpreadsheetData {
  spreadsheetId: string;
  title: string;
  sheets: { title: string; rowCount: number }[];
  rows: string[][];
}

export interface GoogleFormResponse {
  responseId: string;
  createTime: string;
  answers: Record<string, { textAnswers?: { answers: { value: string }[] } }>;
}

/**
 * GOOGLE DRIVE API
 */
export async function listDriveFiles(query: string = ""): Promise<GoogleDriveFile[]> {
  const token = await getAccessToken();
  if (!token) throw new Error('Silakan Masuk dengan Akun Google terlebih dahulu.');

  const q = query ? encodeURIComponent(query) : encodeURIComponent("trashed = false");
  const url = `https://www.googleapis.com/drive/v3/files?pageSize=20&fields=files(id,name,mimeType,webViewLink,iconLink,createdTime)&q=${q}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gagal membaca Google Drive (${res.status})`);
  }

  const data = await res.json();
  return data.files || [];
}

export async function createDriveFolder(folderName: string): Promise<GoogleDriveFile> {
  const token = await getAccessToken();
  if (!token) throw new Error('Silakan Masuk dengan Akun Google terlebih dahulu.');

  const metadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
  };

  const res = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(metadata),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Gagal membuat folder di Google Drive');
  }

  return await res.json();
}

/**
 * GOOGLE SHEETS API
 */
export async function readSpreadsheetData(spreadsheetId: string, range: string = 'Sheet1!A1:Z50'): Promise<string[][]> {
  const token = await getAccessToken();
  if (!token) throw new Error('Silakan Masuk dengan Akun Google terlebih dahulu.');

  const cleanId = extractSpreadsheetId(spreadsheetId);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${encodeURIComponent(range)}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gagal membaca Google Sheets (${res.status})`);
  }

  const data = await res.json();
  return data.values || [];
}

export async function appendPPKSToSpreadsheet(spreadsheetId: string, ppks: PPKSRecord): Promise<boolean> {
  const token = await getAccessToken();
  if (!token) throw new Error('Silakan Masuk dengan Akun Google terlebih dahulu.');

  const cleanId = extractSpreadsheetId(spreadsheetId);
  const range = 'Sheet1!A:J';
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`;

  const row = [
    ppks.timestamp,
    ppks.namaLengkap,
    ppks.nik,
    ppks.usia.toString(),
    ppks.jenisKelamin,
    ppks.kotaDomisili,
    ppks.noHpWa,
    ppks.jenisBantuan,
    ppks.intervensiMental,
    `Desil ${ppks.desil}`,
  ];

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      values: [row],
    }),
  });

  return res.ok;
}

export async function createGoogleSpreadsheet(title: string): Promise<string> {
  const token = await getAccessToken();
  if (!token) throw new Error('Silakan Masuk dengan Akun Google terlebih dahulu.');

  const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title },
      sheets: [
        {
          properties: { title: 'Sheet1' },
          data: [
            {
              startRow: 0,
              startColumn: 0,
              rowData: [
                {
                  values: [
                    { userEnteredValue: { stringValue: 'Timestamp' } },
                    { userEnteredValue: { stringValue: 'Nama Lengkap' } },
                    { userEnteredValue: { stringValue: 'NIK' } },
                    { userEnteredValue: { stringValue: 'Usia' } },
                    { userEnteredValue: { stringValue: 'Jenis Kelamin' } },
                    { userEnteredValue: { stringValue: 'Kota Domisili' } },
                    { userEnteredValue: { stringValue: 'No HP/WA' } },
                    { userEnteredValue: { stringValue: 'Jenis Bantuan' } },
                    { userEnteredValue: { stringValue: 'Intervensi Mental' } },
                    { userEnteredValue: { stringValue: 'Desil' } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Gagal membuat Google Spreadsheet baru');
  }

  const data = await res.json();
  return data.spreadsheetId;
}

/**
 * GOOGLE FORMS API
 */
export async function fetchFormResponses(formId: string): Promise<GoogleFormResponse[]> {
  const token = await getAccessToken();
  if (!token) throw new Error('Silakan Masuk dengan Akun Google terlebih dahulu.');

  const cleanId = extractFormId(formId);
  const url = `https://forms.googleapis.com/v1/forms/${cleanId}/responses`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gagal mengambil respon Google Forms (${res.status})`);
  }

  const data = await res.json();
  return data.responses || [];
}

/**
 * Utilities
 */
function extractSpreadsheetId(input: string): string {
  if (input.includes('/d/')) {
    const parts = input.split('/d/');
    return parts[1].split('/')[0];
  }
  return input.trim();
}

function extractFormId(input: string): string {
  if (input.includes('/forms/d/')) {
    const parts = input.split('/forms/d/');
    return parts[1].split('/')[0];
  }
  return input.trim();
}
