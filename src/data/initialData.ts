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

// Start with an empty database; real PPKS records must be entered or loaded from an authorized source.
export const initialPPKSList: PPKSRecord[] = [];

export const initialSuratList: SuratRecord[] = [];

export const SUMUT_DISTRICTS = [
  { id: 'medan', name: 'Kota Medan', count: 48, lat: 3.5952, lng: 98.6722 },
  { id: 'deliserdang', name: 'Kab. Deli Serdang', count: 32, lat: 3.5542, lng: 98.8631 },
  { id: 'binjai', name: 'Kota Binjai', count: 18, lat: 3.6006, lng: 98.4854 },
  { id: 'pematangsiantar', name: 'Kota Pematangsiantar', count: 21, lat: 2.9599, lng: 99.0687 },
  { id: 'asahan', name: 'Kab. Asahan', count: 15, lat: 2.9833, lng: 99.6167 },
  { id: 'karo', name: 'Kab. Karo', count: 12, lat: 3.1167, lng: 98.5000 },
  { id: 'tapanuliutara', name: 'Kab. Tapanuli Utara', count: 11, lat: 2.0167, lng: 99.0000 },
  { id: 'tanjungbalai', name: 'Kota Tanjungbalai', count: 14, lat: 2.9667, lng: 99.8000 },
  { id: 'labuhanbatu', name: 'Kab. Labuhanbatu', count: 13, lat: 2.1667, lng: 100.0000 },
  { id: 'simalungun', name: 'Kab. Simalungun', count: 16, lat: 2.9167, lng: 99.0500 },
  { id: 'tebingtinggi', name: 'Kota Tebing Tinggi', count: 9, lat: 3.3283, lng: 99.1625 },
  { id: 'dairi', name: 'Kab. Dairi', count: 7, lat: 2.7500, lng: 98.3000 },
  { id: 'toba', name: 'Kab. Toba', count: 8, lat: 2.3500, lng: 99.1000 },
  { id: 'nias', name: 'Kepulauan Nias', count: 6, lat: 1.2833, lng: 97.6167 },
];
