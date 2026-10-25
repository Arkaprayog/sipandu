import { PPKSRecord, ProfileUser, SuratRecord, AppSettings } from '../types';
import { GOOGLE_SIPANDU_RESOURCES } from '../lib/googleSIPANDUResources';

export const initialProfileUser: ProfileUser = {
  nama: 'Deny Arifin Martyon S.',
  nip: '19920315 202012 1 002',
  unitKerja: 'Direktorat Rehabilitasi Sosial Korban Penyalahgunaan Narkoba & ODHIV',
  jabatan: 'Pendamping Rehabilitasi Sosial ODHIV Prov. Sumatera Utara',
  noHp: '081260887722',
  photoUrl: '',
};

export const initialAppSettings: AppSettings = {
  googleFormTahapAwalUrl: GOOGLE_SIPANDU_RESOURCES.formEditorUrl,
  googleFormKesehatanMentalUrl: 'https://forms.gle/Asesmen-Kesehatan-Mental-ODHIV-Kemensos',
  googleSpreadsheetUrl: '', // Writable database target stays separate from the Google Forms response spreadsheet.
  googleSpreadsheetSourceUrl: '', // Deliberately blank until the user chooses the real source spreadsheet.
  googleSpreadsheetSourceName: '',
  googleSpreadsheetSourceTab: '',
  googleDriveFolderUrl: GOOGLE_SIPANDU_RESOURCES.driveFolderUrl,
  senderName: 'Deny Arifin Martyon S.',
  senderRole: 'Pendamping ODHIV',
  senderUnit: 'Direktorat Rehabilitasi Sosial Korban Penyalahgunaan Narkoba & ODHIV',
};

/**
 * IDs used only by the retired demo PPKS records. These are filtered from old
 * browser caches and cloud-load results so the sample data cannot reappear.
 */
export const LEGACY_SAMPLE_PPKS_IDS: ReadonlySet<string> = new Set([
  'PPKS-SU-2026-001',
  'PPKS-SU-2026-002',
  'PPKS-SU-2026-003',
  'PPKS-SU-2026-004',
  'PPKS-SU-2026-005',
  'PPKS-SU-2026-006',
  'PPKS-SU-2026-007',
  'PPKS-SU-2026-008',
]);

/** Exact placeholder respondent names previously shipped in demo data and notifications. */
export const LEGACY_SAMPLE_PPKS_NAMES: ReadonlySet<string> = new Set([
  'rahmat hidayat simanjuntak',
  'dewi sartika lubis',
  'ferry ardiansyah harahap',
  'sri wahyuni siregar',
  'johan marbun',
  'melati anggraini sinaga',
  'tigor pangaribuan',
  'aisyah putri tanjung',
]);

export function isObviousDemoMarker(value: unknown): boolean {
  const text = String(value ?? '').trim();
  if (!text) return false;
  return /^(?:demo|sample|contoh|dummy|uji[\s_-]?coba|data[\s_-]?uji|uji[\s_-]?data|test(?:[\s_-]?data)?)(?:$|[\s:._-])/i.test(text) ||
    /^(?:PPKS|RESPONDEN|RECORD|DATA|ID)[\s_-]*(?:DEMO|SAMPLE|CONTOH|DUMMY|TEST|UJI)[\s_-]*/i.test(text);
}

export function isLegacySamplePPKS(record: Pick<PPKSRecord, 'id' | 'namaLengkap'> | null | undefined): boolean {
  if (!record) return false;
  const id = String(record.id || '').trim();
  const name = String(record.namaLengkap || '').trim();
  if (LEGACY_SAMPLE_PPKS_IDS.has(id)) return true;
  if (LEGACY_SAMPLE_PPKS_NAMES.has(name.toLocaleLowerCase('id-ID'))) return true;
  return isObviousDemoMarker(id) || isObviousDemoMarker(name);
}

// Start with an empty database; real PPKS records must be entered or loaded from an authorized source.
export const initialPPKSList: PPKSRecord[] = [];

// Do not seed the Documents module with fictitious official letters.
export const initialSuratList: SuratRecord[] = [];

export const SUMUT_DISTRICTS = [
  { id: 'medan', name: 'Kota Medan', lat: 3.5952, lng: 98.6722 },
  { id: 'deliserdang', name: 'Kab. Deli Serdang', lat: 3.5542, lng: 98.8631 },
  { id: 'binjai', name: 'Kota Binjai', lat: 3.6006, lng: 98.4854 },
  { id: 'pematangsiantar', name: 'Kota Pematangsiantar', lat: 2.9599, lng: 99.0687 },
  { id: 'asahan', name: 'Kab. Asahan', lat: 2.9833, lng: 99.6167 },
  { id: 'karo', name: 'Kab. Karo', lat: 3.1167, lng: 98.5000 },
  { id: 'tapanuliutara', name: 'Kab. Tapanuli Utara', lat: 2.0167, lng: 99.0000 },
  { id: 'tanjungbalai', name: 'Kota Tanjungbalai', lat: 2.9667, lng: 99.8000 },
  { id: 'labuhanbatu', name: 'Kab. Labuhanbatu', lat: 2.1667, lng: 100.0000 },
  { id: 'simalungun', name: 'Kab. Simalungun', lat: 2.9167, lng: 99.0500 },
  { id: 'tebingtinggi', name: 'Kota Tebing Tinggi', lat: 3.3283, lng: 99.1625 },
  { id: 'dairi', name: 'Kab. Dairi', lat: 2.7500, lng: 98.3000 },
  { id: 'toba', name: 'Kab. Toba', lat: 2.3500, lng: 99.1000 },
  { id: 'nias', name: 'Kepulauan Nias', lat: 1.2833, lng: 97.6167 },
];
