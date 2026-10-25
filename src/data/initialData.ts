import { PPKSRecord, ProfileUser, SuratRecord, AppSettings } from '../types';
import { GOOGLE_SIPANDU_RESOURCES } from '../lib/googleSIPANDUResources';

export const initialProfileUser: ProfileUser = {
  nama: '',
  nip: '',
  unitKerja: '',
  jabatan: '',
  noHp: '',
  photoUrl: '',
};

export const initialAppSettings: AppSettings = {
  googleFormTahapAwalUrl: GOOGLE_SIPANDU_RESOURCES.formEditorUrl,
  googleFormKesehatanMentalUrl: '',
  googleSpreadsheetUrl: '', // Writable database target stays separate from the Google Forms response spreadsheet.
  googleSpreadsheetSourceUrl: '', // Deliberately blank until the user chooses the real source spreadsheet.
  googleSpreadsheetSourceName: '',
  googleSpreadsheetSourceTab: '',
  googleDriveFolderUrl: GOOGLE_SIPANDU_RESOURCES.driveFolderUrl,
  senderName: '',
  senderRole: '',
  senderUnit: '',
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

/** Exact fictional respondent names used by earlier demo records and fake notifications. */
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

export const initialSuratList: SuratRecord[] = [];

export const SUMUT_DISTRICTS = [
  { id: 'nias', name: 'Kab. Nias', aliases: ['Nias'], lat: 1.0, lng: 97.6 },
  { id: 'mandailingnatal', name: 'Kab. Mandailing Natal', aliases: ['Madina', 'Panyabungan'], lat: 0.85, lng: 99.55 },
  { id: 'tapanuliselatan', name: 'Kab. Tapanuli Selatan', aliases: ['Tapsel'], lat: 1.4, lng: 99.25 },
  { id: 'tapanulitengah', name: 'Kab. Tapanuli Tengah', aliases: ['Tapteng', 'Pandan'], lat: 1.6, lng: 98.9 },
  { id: 'tapanuliutara', name: 'Kab. Tapanuli Utara', aliases: ['Taput', 'Tarutung'], lat: 2.0167, lng: 99.0 },
  { id: 'toba', name: 'Kab. Toba', aliases: ['Toba Samosir', 'Tobasa', 'Balige'], lat: 2.35, lng: 99.1 },
  { id: 'labuhanbatu', name: 'Kab. Labuhanbatu', aliases: ['Labuhan Batu', 'Labuhanbatu', 'Rantau Prapat', 'Rantauprapat'], lat: 2.1667, lng: 100.0 },
  { id: 'asahan', name: 'Kab. Asahan', aliases: ['Kisaran'], lat: 2.9833, lng: 99.6167 },
  { id: 'simalungun', name: 'Kab. Simalungun', aliases: ['Raya'], lat: 2.9167, lng: 99.05 },
  { id: 'dairi', name: 'Kab. Dairi', aliases: ['Sidikalang'], lat: 2.75, lng: 98.3 },
  { id: 'karo', name: 'Kab. Karo', aliases: ['Kabanjahe', 'Berastagi'], lat: 3.1167, lng: 98.5 },
  { id: 'deliserdang', name: 'Kab. Deli Serdang', aliases: ['Deli Serdang', 'Lubuk Pakam', 'Deliserdang'], lat: 3.5542, lng: 98.8631 },
  { id: 'langkat', name: 'Kab. Langkat', aliases: ['Stabat'], lat: 3.7, lng: 98.3 },
  { id: 'niasselatan', name: 'Kab. Nias Selatan', aliases: ['Nias Selatan', 'Teluk Dalam'], lat: 0.6, lng: 97.8 },
  { id: 'humbanghasundutan', name: 'Kab. Humbang Hasundutan', aliases: ['Humbahas', 'Dolok Sanggul'], lat: 2.3, lng: 98.9 },
  { id: 'pakpakbharat', name: 'Kab. Pakpak Bharat', aliases: ['Pakpak Bharat', 'Salak'], lat: 2.6, lng: 98.2 },
  { id: 'samosir', name: 'Kab. Samosir', aliases: ['Pangururan'], lat: 2.6, lng: 98.8 },
  { id: 'serdangbedagai', name: 'Kab. Serdang Bedagai', aliases: ['Sergei', 'Sei Rampah', 'Serdang Bedagai'], lat: 3.4, lng: 99.1 },
  { id: 'batubara', name: 'Kab. Batu Bara', aliases: ['Batubara', 'Batu Bara', 'Lima Puluh'], lat: 3.2, lng: 99.5 },
  { id: 'padanglawasutara', name: 'Kab. Padang Lawas Utara', aliases: ['Paluta', 'Gunung Tua', 'Gunungtua'], lat: 1.5, lng: 99.7 },
  { id: 'padanglawas', name: 'Kab. Padang Lawas', aliases: ['Palas', 'Sibuhuan'], lat: 1.0, lng: 99.8 },
  { id: 'labuhanbatuselatan', name: 'Kab. Labuhanbatu Selatan', aliases: ['Labuhan Batu Selatan', 'Labuhanbatu Selatan', 'Labusel', 'Kota Pinang', 'Kotapinang'], lat: 1.7, lng: 100.1 },
  { id: 'labuhanbatuutara', name: 'Kab. Labuhanbatu Utara', aliases: ['Labuhan Batu Utara', 'Labura', 'Aek Kanopan'], lat: 2.5, lng: 99.8 },
  { id: 'niasutara', name: 'Kab. Nias Utara', aliases: ['Nias Utara', 'Lotu'], lat: 1.3, lng: 97.4 },
  { id: 'niasbarat', name: 'Kab. Nias Barat', aliases: ['Nias Barat', 'Lahomi'], lat: 1.1, lng: 97.3 },
  { id: 'sibolga', name: 'Kota Sibolga', aliases: ['Sibolga'], lat: 1.74, lng: 98.78 },
  { id: 'tanjungbalai', name: 'Kota Tanjungbalai', aliases: ['Tanjung Balai', 'Tanjungbalai'], lat: 2.9667, lng: 99.8 },
  { id: 'pematangsiantar', name: 'Kota Pematangsiantar', aliases: ['Pematang Siantar', 'Siantar'], lat: 2.9599, lng: 99.0687 },
  { id: 'tebingtinggi', name: 'Kota Tebing Tinggi', aliases: ['Tebing Tinggi'], lat: 3.3283, lng: 99.1625 },
  { id: 'medan', name: 'Kota Medan', aliases: ['Medan'], lat: 3.5952, lng: 98.6722 },
  { id: 'binjai', name: 'Kota Binjai', aliases: ['Binjai'], lat: 3.6006, lng: 98.4854 },
  { id: 'padangsidimpuan', name: 'Kota Padangsidimpuan', aliases: ['Padang Sidempuan', 'Padangsidimpuan', 'Padangsidempuan'], lat: 1.37, lng: 99.27 },
  { id: 'gunungsitoli', name: 'Kota Gunungsitoli', aliases: ['Gunungsitoli', 'Gunung Sitoli'], lat: 1.28, lng: 97.61 },
];
