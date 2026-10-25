import { PPKSRecord, ProfileUser, SuratRecord, AppSettings } from '../types';
import { GOOGLE_SIPANDU_RESOURCES } from '../lib/googleSIPANDUResources';

export const initialProfileUser: ProfileUser = {
  nama: 'Deny Arifin Martyon S.',
  nip: '19920315 202012 1 002',
  unitKerja: 'Direktorat Rehabilitasi Sosial Korban Penyalahgunaan Narkoba & ODHIV',
  jabatan: 'Pendamping Rehabilitasi Sosial ODHIV Prov. Sumatera Utara',
  noHp: '081260887722',
  photoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
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

// Start with an empty database; real PPKS records must be entered or loaded from an authorized source.
export const initialPPKSList: PPKSRecord[] = [];

export const initialSuratList: SuratRecord[] = [
  {
    id: 'SRT-ST-001',
    nomorSurat: 'ST.03.02/REHSOS-ODHIV/10/2026',
    judul: 'Surat Tugas Pendampingan & Verifikasi Lapangan PPKS ODHIV Wilayah Medan & Deli Serdang',
    jenis: 'Surat Tugas',
    tanggal: '2026-10-20',
    petugas: 'Deny Arifin Martyon S.',
    nipPetugas: '19920315 202012 1 002',
    lokasi: 'Kota Medan & Kab. Deli Serdang',
    status: 'Aktif',
    deskripsi: 'Melakukan asesmen komprehensif 6 lembar, verifikasi berkas administrasi dan fasilitasi bantuan ATENSI Kemensos bagi 24 responden ODHIV.',
  },
  {
    id: 'SRT-BA-002',
    nomorSurat: 'BA.08.01/ATENSI-ODHIV/10/2026',
    judul: 'Berita Acara Serah Terima Bantuan Kebutuhan Dasar & Nutrisi ODHIV',
    jenis: 'Berita Acara',
    tanggal: '2026-10-18',
    petugas: 'Deny Arifin Martyon S.',
    nipPetugas: '19920315 202012 1 002',
    lokasi: 'Sentra Bahagia / Wilayah Binaan Sumut',
    status: 'Aktif',
    deskripsi: 'Penyerahan paket nutrisi tambahan daya tahan tubuh (susu khusus, multivitamin kompleks, sembako) untuk PPKS rentan.',
  },
  {
    id: 'SRT-SP-003',
    nomorSurat: 'SP.01.04/DAMPING-ODHIV/09/2026',
    judul: 'Surat Pernyataan Kesediaan Didampingi Program Rehabilitasi Sosial ODHIV',
    jenis: 'Surat Pernyataan',
    tanggal: '2026-09-28',
    petugas: 'Deny Arifin Martyon S.',
    nipPetugas: '19920315 202012 1 002',
    lokasi: 'Sumatera Utara',
    status: 'Arsip',
    deskripsi: 'Pernyataan sukarela kerahasiaan data medis dan komitmen kepatuhan pengobatan ARV.',
  },
];

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
