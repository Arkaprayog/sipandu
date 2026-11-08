export interface PPKSRecord {
  id: string;
  timestamp: string;
  namaLengkap: string;
  nik: string;
  usia: number;
  jenisKelamin: 'Laki-laki' | 'Perempuan';
  kotaDomisili: string;
  alamatLengkap: string;
  noHpWa: string;
  jenisBantuan: string;
  intervensiMental: string;
  desil: number; // 0 to 10
  fotoDiri: string;
  fotoKtp: string;
  fotoKk?: string;
  fotoRumah?: string;
  /** Explicit photo uploads made in SIPANDU; source-sheet photos take precedence when present. */
  manualPhotoOverrides?: { fotoDiri?: string; fotoKtp?: string; fotoKk?: string; fotoRumah?: string };
  statusAsesmen: 'Tahap Awal' | 'Lanjutan' | 'Terintegrasi' | 'Selesai';
  googleFormSync?: boolean;
  integratedForm?: IntegratedFormData;
  /** Imported/legacy form answers from Google Sheets; not the standalone assessment form's storage. */
  officialAssessment?: Record<string, string | string[]>;
  /** Answers saved exclusively by the independent From Asesmen Terintegrasi form. */
  formAsesmenTerintegrasi?: Record<string, string | string[]>;
}

export interface IntegratedFormData {
  // Lembar 1: Identitas & Administrasi PPKS
  nomorRegistrasi: string;
  noBpjs: string;
  statusPernikahan: string;
  pendidikanTerakhir: string;
  pekerjaan: string;
  kontakDaruratNama: string;
  kontakDaruratHubungan: string;
  kontakDaruratNoHp: string;

  // Lembar 2: Kondisi Medis & Riwayat Pengobatan ODHIV
  tahunDiagnosa: string;
  faskesPdpRujukan: string;
  statusArv: string;
  regimenArv: string;
  kepatuhanArv: string; // Patuh, Kadang Lupa, Drop Out
  nilaiCd4Terakhir: string;
  viralLoadTerakhir: string;
  riwayatInfeksiOportunistik: string;
  kendalaAksesPengobatan: string;

  // Lembar 3: Profil Sosial & Kondisi Keluarga
  statusKeterbukaanStatus: string; // Terbuka ke keluarga, tertutup, hanya pasangan
  dukunganKeluarga: string; // Sangat Mendukung, Netral, Ada Penolakan
  pengalamanStigmaDiskriminasi: string;
  kondisiTempatTinggal: string; // Milik Sendiri, Sewa/Kontrak, Menumpang, shelter
  kondisiKelayakanRumah: string;

  // Lembar 4: Kondisi Ekonomi & Penghidupan
  penghasilanBulanan: string;
  pengeluaranKebutuhanObatNutrisi: string;
  tanggunganKeluarga: number;
  kepemilikanUsaha: string;
  minatKeterampilanAtensi: string;
  desilKemiskinan: number;

  // Lembar 5: Asesmen Psikososial & Kesehatan Mental
  skorKecemasan: string; // Normal, Ringan, Sedang, Berat
  skorDepresi: string;
  penerimaanDiri: string;
  doronganBunuhDiri: string; // Tidak Pernah, Jarang, Pernah
  kebutuhanKonselingSosial: string;

  // Lembar 6: Rencana Intervensi & Rekomendasi Program Atensi Kemensos
  rekomendasiBantuanNutrisi: boolean;
  rekomendasiBantuanModalUsaha: boolean;
  rekomendasiBantuanMedisTransport: boolean;
  rekomendasiRujukanRehabilitasi: boolean;
  catatanIntervensiKhusus: string;
  rencanaAksiPendamping: string;
  jadwalMonitoringBerikutnya: string;
  namaAsesor: string;
  nipAsesor: string;
  supervisorKemensos: string;
}

export interface ProfileUser {
  nama: string;
  nip: string;
  unitKerja: string;
  jabatan: string;
  noHp: string;
  photoUrl: string;
}



export type AssistanceServiceStatus =
  | 'belum-diverifikasi'
  | 'dibutuhkan'
  | 'dalam-proses'
  | 'diterima'
  | 'tidak-dibutuhkan';

export type PsychosocialTherapyStatus =
  | 'belum-dimulai'
  | 'terjadwal'
  | 'aktif'
  | 'selesai';

export type PPKSServiceEventType =
  | 'nutrition-assistance'
  | 'entrepreneurship-assistance'
  | 'psychosocial-therapy';

export type PPKSFollowUpReason =
  | ''
  | 'konfirmasi-penerimaan-bantuan'
  | 'penjadwalan-penyaluran'
  | 'monitoring-pendampingan'
  | 'evaluasi-terapi'
  | 'verifikasi-dokumen'
  | 'lainnya';

/** Compact operational status. No NIK, diagnosis, or clinical narrative is stored here. */
export interface PPKSServiceStatus {
  ppksId: string;
  nutritionStatus: AssistanceServiceStatus;
  entrepreneurshipStatus: AssistanceServiceStatus;
  psychosocialStatus: PsychosocialTherapyStatus;
  lastNutritionAt: string;
  lastEntrepreneurshipAt: string;
  lastTherapyAt: string;
  therapySessionCount: number;
  followUpAt: string;
  followUpReason: PPKSFollowUpReason;
  assignedToUid: string;
  createdAt: string;
  updatedAt: string;
  updatedByUid: string;
}

/** Append-only activity record; intentionally contains only structured service metadata. */
export interface PPKSServiceEvent {
  id: string;
  ppksId: string;
  eventType: PPKSServiceEventType;
  status: AssistanceServiceStatus | PsychosocialTherapyStatus;
  serviceDate: string;
  followUpAt: string;
  followUpReason: PPKSFollowUpReason;
  createdByUid: string;
  assignedToUid: string;
  createdAt: string;
}

export interface PPKSServiceUpdateInput {
  ppksId: string;
  eventType: PPKSServiceEventType;
  status: AssistanceServiceStatus | PsychosocialTherapyStatus;
  serviceDate: string;
  followUpAt: string;
  followUpReason: PPKSFollowUpReason;
  initialStatus: PPKSServiceStatus;
}

export interface SuratRecord {
  id: string;
  nomorSurat: string;
  judul: string;
  jenis: 'Surat Tugas' | 'Berita Acara' | 'Surat Pernyataan' | 'Surat Rujukan' | 'Laporan Monev';
  tanggal: string;
  petugas: string;
  nipPetugas: string;
  lokasi: string;
  status: 'Aktif' | 'Selesai' | 'Arsip';
  deskripsi: string;
}

export interface StageOneIntakePayload {
  timestamp: string;
  namaLengkap: string;
  nik: string;
  usia: number;
  jenisKelamin: 'Laki-laki' | 'Perempuan';
  kotaDomisili: string;
  alamatLengkap: string;
  noHpWa: string;
  jenisBantuan: string;
  intervensiMental: string;
  desil: number;
  fotoDiri: string;
  fotoKtp: string;
  statusAsesmen: 'Tahap Awal';
}

export interface GoogleFormUtamaPrefillEntries {
  namaLengkap: string;
  nik: string;
  usia: string;
  jenisKelamin: string;
  kotaDomisili: string;
  noHpWa: string;
  jenisBantuan: string;
  idPpks: string;
}

export interface AppSettings {
  /** Visual theme selected for the SIPANDU application. */
  theme?: 'dark' | 'light';
  /** Legacy setting; Stage-One respondents use a native SIPANDU page. */
  googleFormTahapAwalUrl: string;
  /** Actual numeric entry IDs from Google Forms prefilled-link generation; never guessed. */
  googleFormUtamaPrefillEntries?: GoogleFormUtamaPrefillEntries;
  /** Separate follow-up form used by per-PPKS WhatsApp links. */
  googleFormTahapLanjutanUrl?: string;
  /** Google Forms entry number of the prefilled "ID PPKS" question. */
  googleFormTahapLanjutanIdEntry?: string;
  googleFormKesehatanMentalUrl: string;
  /** Writable SIPANDU database spreadsheet (must not be the Google Forms response sheet). */
  googleSpreadsheetUrl: string;
  /** Read-only source spreadsheet used to import PPKS / integrated assessment responses. */
  googleSpreadsheetSourceUrl?: string;
  googleSpreadsheetSourceName?: string;
  googleSpreadsheetSourceTab?: string;
  googleDriveFolderUrl: string;
  senderName: string;
  senderRole: string;
  senderUnit: string;
}
