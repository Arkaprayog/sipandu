import { getAccessToken, invalidateAccessToken } from './firebase';
import { IntegratedFormData, PPKSRecord } from '../types';
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
      invalidateAccessToken();
      throw new Error('Token Google API telah kedaluwarsa atau dicabut. Sesi akun tetap tersimpan, tetapi izin API perlu dipulihkan sekali lagi melalui Koneksi Akun. Muat ulang tidak akan menghapus token yang masih berlaku.');
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
    fields: 'sheets(properties(title),data(rowData(values(formattedValue,hyperlink,textFormatRuns(format(link(uri)))))))',
  });
  const data = await googleJson<{
    sheets?: {
      properties?: { title?: string };
      data?: {
        rowData?: {
          values?: {
            formattedValue?: string;
            hyperlink?: string;
            textFormatRuns?: Array<{ format?: { link?: { uri?: string } } }>;
          }[];
        }[];
      }[];
    }[];
  }>(`https://sheets.googleapis.com/v4/spreadsheets/${id}?${params.toString()}`);

  const sheet = data.sheets?.[0];
  const rowData = sheet?.data?.[0]?.rowData || [];
  return rowData.map((row) => (row.values || []).map((cell) => {
    const runLink = cell.textFormatRuns?.find((run) => run.format?.link?.uri)?.format?.link?.uri;
    // Prefer the actual link for uploaded photo cells; otherwise preserve the
    // formatted display value, including leading zeroes in NIK cells.
    return String(cell.hyperlink || runLink || cell.formattedValue || '');
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
  return String(value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
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

/** Robustly maps common NIK / identity-card question labels from Google Forms. */
function isLikelyRespondentNIKHeader(header: string): boolean {
  const normalized = normalizeSheetHeader(header);
  if (!normalized) return false;

  // A respondent NIK is allowed; NIKs belonging to family members, caseworkers,
  // assessors, supervisors, or emergency contacts must never be displayed as theirs.
  const excludedPeople = [
    'ayah', 'ibu', 'orangtua', 'wali', 'suami', 'istri', 'pasangan',
    'keluarga', 'pendamping', 'petugas', 'asesor', 'asessor',
    'supervisor', 'kontakdarurat', 'penanggungjawab',
  ];
  if (excludedPeople.some((word) => normalized.includes(word)) &&
      /(nik|ktp|kependudukan|identitas)/.test(normalized)) return false;

  // Include Indonesian variants such as "No. NIK/KTP (16 digit)",
  // "Nomor Identitas Kependudukan", and longer Google Forms question prompts.
  return normalized === 'nik' ||
    normalized.includes('nik') ||
    normalized.includes('nomorindukkependudukan') ||
    normalized.includes('indukkependudukan') ||
    normalized.includes('nomorkartuidentitas') ||
    normalized.includes('nomorkartutandapenduduk') ||
    normalized.includes('nomorktp') ||
    normalized.includes('noktp') ||
    /^ktp(?:responden|ppks|calonresponden)/.test(normalized) ||
    normalized.includes('noidentitas') ||
    normalized.includes('nomoridentitas') ||
    normalized.includes('identitasresponden') ||
    normalized.includes('nokependudukan') ||
    normalized.includes('noindukkependudukan') ||
    /^no\d*nik/.test(normalized) ||
    /^nik\d*digit/.test(normalized);
}

function normalizeNIKCellValue(value: string): string {
  const raw = String(value ?? '').trim().replace(/^['`]/, '');
  if (!raw) return '';

  // A scientific-notation NIK can already have lost precision in Sheets' numeric
  // storage. Never manufacture a 16-digit identity from a rounded scientific value.
  if (/^[+-]?\d+(?:[.,]\d+)?e[+-]?\d+$/i.test(raw)) return '';

  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 15) return `0${digits}`;
  return digits;
}

/** Reads the respondent NIK even when the Google Forms question title has instructions/punctuation. */
export function readNIKFromSheetRow(headers: string[], row: string[]): string {
  const candidates = headers
    .map((header, index) => ({
      header: String(header ?? '').trim(),
      normalized: normalizeSheetHeader(String(header ?? '')),
      value: String(row[index] ?? '').trim(),
      index,
    }))
    .filter(({ header, normalized, value }) => value && isLikelyRespondentNIKHeader(header) && normalized);

  const score = (header: string): number => {
    const normalized = normalizeSheetHeader(header);
    let points = 0;
    if (['nik', 'nikresponden', 'nikppks', 'nomorindukkependudukan', 'nomorktp', 'noktp'].includes(normalized)) points += 100;
    if (normalized.includes('responden') || normalized.includes('ppks') || normalized.includes('calonresponden')) points += 60;
    if (normalized.includes('nik')) points += 35;
    if (normalized.includes('ktp')) points += 20;
    if (normalized.includes('nomorindukkependudukan')) points += 15;
    if (normalized.length > 100) points -= 10;
    return points;
  };

  // Check all columns, not indexOf(alias): duplicate headers are possible and
  // the first duplicate may be blank while a later column contains the value.
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
    const namaLengkap = readCellByAliases(headers, row, [
      'namaLengkap', 'namaResponden', 'namaPPKS', 'namaODHIV', 'namaLengkapSesuaiKTP', 'nama',
    ]);
    if (!namaLengkap) return;

    const timestamp = readCellByAliases(headers, row, ['timestamp', 'capWaktu', 'waktuPengiriman', 'waktuPengisian', 'tanggalWaktu', 'createTime']);
    const nik = readNIKFromSheetRow(headers, row);
    const externalId = readCellByAliases(headers, row, ['idPPKS', 'recordId', 'id']);
    const stableSource = [timestamp, nik, namaLengkap, ...row].join('|');
    let hash = 2166136261;
    for (let i = 0; i < stableSource.length; i++) {
      hash ^= stableSource.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const recordId = externalId || (nik ? `SHEET-NIK-${nik.replace(/\D/g, '')}` : `SHEET-${(hash >>> 0).toString(36)}`);
    if (seen.has(recordId)) return;
    seen.add(recordId);

    const usia = parseSheetNumber(readCellByAliases(headers, row, ['usia', 'umur', 'umurTahun', 'usiaSaatIni', 'umurSaatIni']), 0);
    const gender = readCellByAliases(headers, row, ['jenisKelamin', 'gender', 'jenisKelaminResponden']);
    const domisili = readCellByAliases(headers, row, ['kotaDomisili', 'kabupatenKota', 'kotaKabupaten', 'kotaKabupatenDomisili', 'domisiliKabupatenKota', 'domisili', 'kota', 'kabupaten']);
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
    const fotoDiri = readCellByAliases(headers, row, ['fotoDiri', 'fotoDiriPPKS', 'fotoResponden', 'uploadFotoDiri', 'tautanFotoDiri', 'linkFotoDiri', 'fotoDiriCloseUp', 'fotoDiriResponden', 'foto']);
    const fotoKtp = readCellByAliases(headers, row, ['fotoKtp', 'fotoKTP', 'uploadFotoKTP', 'dokumenKTP', 'tautanFotoKTP', 'linkFotoKTP', 'fotoKartuIdentitas', 'scanKTP']);
    const fotoKk = readCellByAliases(headers, row, ['fotoKk', 'fotoKK', 'uploadFotoKK', 'dokumenKK', 'tautanFotoKK', 'linkFotoKK', 'scanKK']);
    const fotoRumah = readCellByAliases(headers, row, ['fotoRumah', 'fotoRumahTampakDepan', 'uploadFotoRumah', 'tautanFotoRumah', 'linkFotoRumah', 'fotoDepanRumah', 'fotoTampakDepanRumah']);
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
    };
    if (isLegacySamplePPKS(sourceRecord)) return;
    records.push(sourceRecord);
  });
  return records;
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
  records: PPKSRecord[];
  recordsWithNIK: number;
  recordsMissingNIK: number;
  nikHeadersFound: string[];
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
  const records = mapRowsToPPKSRecords(rows);
  const headers = rows[0] || [];
  const nikHeadersFound = headers.filter((header) => isLikelyRespondentNIKHeader(header)).map((header) => header.trim());
  const recordsWithNIK = records.filter((record) => Boolean(String(record.nik || '').trim())).length;
  return {
    spreadsheetId: metadata.spreadsheetId,
    spreadsheetTitle: metadata.title,
    sheetTitles: metadata.sheetTitles,
    selectedTab,
    rowsRead: rows.length,
    records,
    recordsWithNIK,
    recordsMissingNIK: records.length - recordsWithNIK,
    nikHeadersFound,
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
 * Removes only rows whose identifier or full respondent name matches a known
 * retired demo record. Cell formatting and all non-matching rows are untouched.
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
      .filter(({ header }) => ['id', 'idppks', 'idresponden', 'recordid', 'nomorregistrasi'].includes(header))
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
      // Also detect old rows that placed the retired synthetic ID in a differently named column.
      const anyCellHasLegacyId = row.some((cell) => LEGACY_SAMPLE_PPKS_IDS.has(String(cell || '').trim()));
      if (idMatch || nameMatch || anyCellHasLegacyId) {
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
  return /(^|[^a-z])(demo|sample|contoh|dummy|uji[\s_-]?coba|data[\s_-]?uji|uji[\s_-]?data|test[\s_-]?data|data[\s_-]?test)([^a-z]|$)/i.test(name);
}

async function listAllVisibleDriveFiles(): Promise<GoogleDriveFile[]> {
  const files: GoogleDriveFile[] = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({
      q: 'trashed = false',
      pageSize: '1000',
      orderBy: 'modifiedTime desc',
      fields: 'nextPageToken,files(id,name,mimeType,webViewLink,createdTime,parents)',
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

/** True only for demo artifacts identifiable as SIPANDU legacy data. */
function isSIPANDULegacyDriveArtifact(name: string): boolean {
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
 * Permanently deletes only files whose names explicitly identify demo data or
 * contain one of the exact retired demo IDs/names, inside the configured SIPANDU
 * Drive folder. Unrelated files and unrelated Drive folders are not touched.
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
  const scannedFileIds = new Set<string>();

  const visit = async (parentId: string, depth: number, insideMarkedDemoFolder = false): Promise<void> => {
    if (depth > 5 || visitedFolders.has(parentId)) return;
    visitedFolders.add(parentId);
    const children = await listDriveChildren(parentId);
    children.forEach((file) => scannedFileIds.add(file.id));
    for (const file of children) {
      const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
      if (isFolder) {
        // A folder clearly labelled as demo/sample marks its descendants as
        // disposable demo material. Keep the folder and its permissions intact.
        await visit(file.id, depth + 1, insideMarkedDemoFolder || isObviousDemoDriveName(file.name));
      } else if (insideMarkedDemoFolder || isObviousDemoDriveName(file.name)) {
        discovered.push(file);
      }
    }
  };

  await visit(rootFolderId, 0);

  // Also search the user's visible Drive for exact SIPANDU legacy artifacts,
  // because older example files may have been created outside the configured folder.
  // Broad names like "sample" or "test" are only deleted inside the SIPANDU folder;
  // outside it, the filename must also identify this application.
  let accountWideScanCompleted = false;
  try {
    const allVisible = await listAllVisibleDriveFiles();
    accountWideScanCompleted = true;
    allVisible.forEach((file) => scannedFileIds.add(file.id));
    for (const file of allVisible) {
      if (
        file.mimeType !== 'application/vnd.google-apps.folder' &&
        isSIPANDULegacyDriveArtifact(file.name)
      ) discovered.push(file);
    }
  } catch {
    // Keep the successfully scanned configured folder usable if account-wide
    // listing is not permitted; the caller will still get the folder cleanup result.
  }

  const deletedNames: string[] = [];
  const unique = [...new Map(discovered.map((file) => [file.id, file])).values()];
  for (const file of unique) {
    await googleJson(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?supportsAllDrives=true`,
      { method: 'DELETE' }
    );
    deletedNames.push(file.name);
  }
  return {
    folderId: rootFolderId,
    filesScanned: scannedFileIds.size,
    filesDeleted: deletedNames.length,
    deletedNames,
    accountWideScanCompleted,
  };
}
