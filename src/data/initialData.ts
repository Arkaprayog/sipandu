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
