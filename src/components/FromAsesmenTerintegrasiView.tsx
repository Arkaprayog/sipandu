import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, FileText, Printer, RotateCcw, Save, Search } from 'lucide-react';
import { PPKSRecord } from '../types';
import { getAccessToken, invalidateAccessToken, refreshWorkspaceAccessToken } from '../lib/firebase';
import { formatPPKSTimestamp } from '../lib/ppksData';
import { publicAssetUrl } from '../lib/publicAssets';
import { backupAssessmentToCentralDrive, deleteCentralDriveFile } from '../lib/googleDriveBackup';
import { getIntegratedAssessmentBackupMetadata, saveIntegratedAssessmentBackupMetadata } from '../lib/firebase';
import { printCurrentWebView } from '../lib/printing';
import { createPhotoPreviewBlob, MAX_PPKS_PHOTO_FILE_BYTES } from '../lib/photoFilePreview';
import '../officialAssessment.css';

type AnswerValue = string | string[];
type FieldKind = 'text' | 'date' | 'number' | 'textarea' | 'single' | 'multi';
interface OfficialField {
  key: string; number?: number; label: string; kind?: FieldKind;
  options?: string[]; optional?: boolean; placeholder?: string;
}
interface OfficialGroup { title?: string; tone?: 'gray' | 'beige' | 'white'; fields: OfficialField[]; }
interface OfficialPage { groups: OfficialGroup[]; hasLetterhead?: boolean; }
interface FromAsesmenTerintegrasiViewProps { ppksList: PPKSRecord[]; onSaveAssessment: (updated: PPKSRecord) => Promise<void>; initialSelectedPPKSId?: string; onBeforePrint?: (updated: PPKSRecord) => Promise<void>; }

const field = (number: number, label: string, kind: FieldKind = 'text', options?: string[], optional = false): OfficialField => ({
  key: 'q' + number, number, label, kind, options, optional,
});
const textField = (number: number, label: string, optional = false) => field(number, label, 'text', undefined, optional);
const areaField = (number: number, label: string, optional = false) => field(number, label, 'textarea', undefined, optional);
const oneField = (number: number, label: string, options: string[], optional = false) => field(number, label, 'single', options, optional);
const manyField = (number: number, label: string, options: string[], optional = false) => field(number, label, 'multi', options, optional);

const agama = ['Islam', 'Kristen', 'Katolik', 'Hindu', 'Budha', 'Konghuchu', 'Lainnya'];
const bantuan = ['Belum Menerima Bantuan', 'PKH', 'Sembako', 'KIS PBI JK', 'KIP', 'Prokus', 'Lainnya'];
const pendidikan = ['Tidak Sekolah', 'Belum Sekolah', 'SD', 'SMP', 'SMA', 'Perguruan Tinggi'];
const statusKawin = ['Belum Kawin', 'Kawin', 'Cerai Hidup', 'Cerai Mati'];
const jenisKelamin = ['Laki-laki', 'Perempuan'];
const penghasilan = ['< Rp500.000,-', 'Rp500.000,- – < Rp1.500.000,-', 'Rp1.500.000,- – < Rp2.500.000,-', 'Rp2.500.000,- – < Rp3.500.000,-', '>= Rp3.500.000,-'];
const komponenLayanan = [
  'Pemenuhan Kebutuhan Hidup Layak', 'Perawatan dan Pengasuhan Sosial', 'Dukungan Keluarga',
  'Terapi (Fisik, Psikososial, Mental Spiritual)', 'Pelatihan Vokasional/Pembinaan Kewirausahaan',
  'Bantuan dan Asistensi Sosial', 'Dukungan Aksesibilitas',
];

const sourcePages: OfficialPage[] = [
  {
    hasLetterhead: true,
    groups: [
      { title: 'A. ASESMEN CEPAT (RAPID ASSESSMENT)', tone: 'gray', fields: [
        field(1, 'Tanggal/Bulan/Tahun Asesmen', 'date'),
        textField(2, 'Nama Petugas Asesmen'),
        textField(3, 'Unit Kerja Petugas Asesmen (nama sentra terpadu/sentra)'),
      ]},
      { title: 'PROFILE LENGKAP PPKS', tone: 'beige', fields: [] },
      { title: 'ALAMAT SESUAI KTP', tone: 'beige', fields: [
        textField(4, 'Provinsi'), textField(5, 'Kabupaten/Kota'), textField(6, 'Kecamatan'),
        textField(7, 'Desa/Kelurahan'), textField(8, 'Dusun, RT/RW'), textField(9, 'Alamat Lengkap (Nama Jalan & No Rumah)'),
      ]},
      { title: 'ALAMAT SESUAI DOMISILI', tone: 'beige', fields: [
        textField(10, 'Provinsi'), textField(11, 'Kabupaten/Kota'), textField(12, 'Kecamatan'),
        textField(13, 'Desa/Kelurahan'), textField(14, 'Dusun, RT/RW'), textField(15, 'Alamat Lengkap (Nama Jalan & No Rumah)'),
      ]},
      { title: 'IDENTITAS PPKS', tone: 'beige', fields: [
        textField(16, 'Nama Lengkap'), textField(17, 'Tempat Lahir'), field(18, 'Tanggal/bln/th Lahir', 'date'),
        oneField(19, 'Jenis Kelamin', jenisKelamin), textField(20, 'Asal Daerah'), textField(21, 'Suku'),
        oneField(22, 'Agama', agama), { ...textField(23, 'NIK **'), placeholder: '16 digit NIK' },
        textField(24, 'Nomor Kartu Keluarga **'),
      ]},
    ],
  },
  {
    groups: [
      { tone: 'white', fields: [
        { ...textField(25, 'Nomor Akta Lahir **'), placeholder: '-' },
        oneField(26, 'Apakah sudah masuk DTKS?', ['Belum', 'Sudah']),
        oneField(27, 'Bantuan yang diterima saat ini', bantuan),
        oneField(28, 'Pendidikan Terakhir', pendidikan),
        oneField(29, 'Status Kawin', statusKawin),
      ]},
      { title: 'PROFIL PENGAMPU PPKS [opsional]', tone: 'beige', fields: [
        textField(30, 'Nama Lengkap', true), textField(31, 'Nomor Hp/ Telepon', true),
        oneField(32, 'Hubungan dengan PPKS', ['Ayah', 'Ibu', 'Kakek', 'Nenek', 'Saudara Kandung', 'Lainnya'], true),
        textField(33, 'Tempat Lahir', true), field(34, 'Tanggal/bulan/tahun Lahir', 'date', undefined, true),
        oneField(35, 'Jenis Kelamin', jenisKelamin, true), textField(36, 'Asal Daerah', true),
        textField(37, 'Suku', true), oneField(38, 'Agama', agama, true),
        textField(39, 'NIK **', true), textField(40, 'Nomor KK **', true),
        oneField(41, 'Apakah sudah masuk DTKS?', ['Belum', 'Sudah'], true),
        oneField(42, 'Bantuan yang diterima saat ini', bantuan, true),
        oneField(43, 'Pendidikan terakhir', pendidikan, true),
      ]},
    ],
  },
  {
    groups: [
      { tone: 'white', fields: [
        oneField(44, 'Status Kawin', statusKawin), textField(45, 'Pekerjaan'),
        oneField(46, 'Penghasilan per Bulan', penghasilan),
      ]},
      { title: 'KONDISI PPKS', tone: 'gray', fields: [
        oneField(47, 'Kategori PPKS', ['Anak', 'Lansia', 'Disabilitas', 'Korban Bencana dan Kedaruratan']),
        manyField(48, 'Ragam Penyandang Disabilitas', [
          'Fisik – amputasi/lumpuh layuh/kaku', 'Paraplegi, cerebral palsy (CP)', 'Akibat stroke', 'Akibat kusta',
          'Dwarfisme (kerdil)', 'Intelektual – lambat belajar', 'Disabilitas grahita', 'Down syndrome',
          'Mental – skizofrenia', 'Bipolar', 'Depresi', 'Ansietas', 'Gangguan kepribadian', 'Autis',
          'Hiperaktif', 'Sensorik – netra', 'Sensorik – rungu', 'Sensorik – wicara', 'Ganda/Multi',
        ]),
        oneField(49, 'Tingkatan Disabilitas', ['Ringan', 'Sedang', 'Berat']),
        oneField(50, 'Apakah sudah memiliki kartu penyandang Disabilitas?', ['Ya', 'Tidak']),
        manyField(51, 'Ragam Anak', [
          'Anak dalam situasi darurat/pengungsi/kerusuhan/bencana/konflik', 'Anak berhadapan dengan hukum',
          'Anak kelompok minoritas dan terisolasi', 'Anak dieksploitasi secara ekonomi dan/atau seksual',
          'Korban penyalahgunaan narkotika, alkohol, psikotropika, dan zat adiktif', 'Korban pornografi',
          'Anak dengan HIV/AIDS', 'Korban penculikan, penjualan, dan/atau perdagangan',
          'Korban kekerasan fisik dan/atau psikis', 'Korban kejahatan seksual', 'Korban jaringan terorisme',
          'Anak penyandang disabilitas', 'Korban perlakuan salah dan penelantaran',
          'Anak dengan perilaku sosial menyimpang', 'Korban stigmatisasi terkait kondisi orang tua',
        ]),
      ]},
    ],
  },
  {
    groups: [
      { tone: 'white', fields: [
        manyField(52, 'Ragam Korban Bencana dan Kedaruratan', [
          'Tuna Susila', 'Gelandangan', 'Pengemis', 'Pemulung', 'Kelompok Minoritas',
          'Bekas Warga Binaan Lembaga Pemasyarakatan (BWBLP)', 'Orang dengan HIV/AIDS (ODHA)',
          'Korban Penyalahgunaan NAPZA', 'Korban trafficking', 'Korban tindak kekerasan',
          'Pekerja Migran Indonesia Bermasalah (PMIB)', 'Perempuan rawan sosial ekonomi',
          'Korban bencana alam', 'Korban bencana sosial',
        ]),
        oneField(53, 'Jika kategori Lansia atau Disabilitas, membutuhkan bantuan dalam aktivitas sehari-hari (Activity Daily Living)?', ['Ya', 'Tidak']),
        oneField(54, 'Kondisi Fisik PPKS', ['Sehat', 'Sakit']),
        areaField(55, 'Jelaskan Kondisi Fisik (kesehatan, mobilitas, dll)'),
        areaField(56, 'Kondisi Psikologis PPKS'), areaField(57, 'Kondisi sosial PPKS'),
        areaField(58, 'Kondisi Mental Spiritual'), areaField(59, 'Kondisi Keluarga'),
      ]},
      { title: 'KONDISI SOSIAL EKONOMI', tone: 'gray', fields: [
        oneField(60, 'Apakah Kepala Keluarga Bekerja?', ['Tidak', 'Iya']),
        textField(61, 'Pekerjaan'), oneField(62, 'Penghasilan Keluarga per Bulan', penghasilan),
        field(63, 'Jumlah Tanggungan', 'number'),
        oneField(64, 'Apakah pernah tidak makan dalam sehari?', ['Tidak', 'Pernah khawatir tidak makan', 'Pernah tidak makan']),
        field(65, 'Pengeluaran Pangan per Bulan (Rp)', 'number'),
        field(66, 'Pengeluaran Total per Bulan (Rp)', 'number'),
        oneField(67, 'Apakah ada pengeluaran pakaian dalam setahun?', ['Tidak', 'Ya']),
      ]},
      { title: 'KONDISI TEMPAT TINGGAL', tone: 'gray', fields: [
        oneField(68, 'Tempat Tinggal saat ini', ['Milik Sendiri', 'Sewa', 'Menumpang', 'Lembaga', 'Telantar/Menggelandang']),
        oneField(69, 'Jika milik sendiri; bukti kepemilikan tanah', ['Sertifikat Hak Milik', 'Hak Guna Bangunan', 'Girik']),
        oneField(70, 'Tinggal Bersama', ['Sendiri', 'Keluarga Inti', 'Keluarga Besar', 'Lainnya']),
        field(71, 'Luas Tempat Tinggal (m²)', 'number'),
      ]},
    ],
  },
  {
    groups: [
      { tone: 'white', fields: [
        oneField(72, 'Kondisi Bangunan', ['Permanen', 'Semi Permanen', 'Lainnya']),
        oneField(73, 'Atap Tempat Tinggal', ['Seng', 'Genteng', 'Asbes', 'Lainnya']),
        oneField(74, 'Lantai Tempat Tinggal', ['Tanah', 'Ubin', 'Kayu']),
        oneField(75, 'Dinding Tempat Tinggal', ['Kayu', 'Bambu', 'Seng', 'Kawat', 'Batu Bata']),
        oneField(76, 'Apakah memiliki jamban/MCK?', ['Tidak', 'Ya']),
        oneField(77, 'Sumber Penerangan', ['Bukan Listrik', 'Listrik 450 VA', 'Listrik 900 VA', 'Lainnya']),
        oneField(78, 'Sumber Air Bersih', ['PDAM', 'Mata Air', 'Sumur', 'Lainnya']),
      ]},
      { title: 'B. PERMASALAHAN, POTENSI & RENCANA INTERVENSI PPKS', tone: 'gray', fields: [
        areaField(79, 'Permasalahan (Gambaran Kasus)'), areaField(80, 'Pelayanan yang pernah diterima'),
        areaField(81, 'Potensi Diri (Minat Bakat, Keterampilan, Motivasi, Hasil Test IQ)'),
        areaField(82, 'Potensi Sumber (Organisasi, Lingkungan, Pendidikan, Ekonomi, Keagamaan, Alam)'),
        manyField(83, 'Komponen Layanan Yang Dibutuhkan', komponenLayanan),
        areaField(84, 'Uraian Komponen Layanan'), areaField(85, 'Pihak yang terlibat dalam rencana intervensi'),
      ]},
      { title: 'C. INTERVENSI PPKS [SKIP]', tone: 'gray', fields: [
        manyField(86, 'Komponen Layanan yang diberikan', komponenLayanan),
        areaField(87, 'Uraian Komponen Layanan'), field(88, 'Estimasi Jumlah Total Bantuan (Rp)', 'number'),
        textField(89, 'Waktu Pemberian Layanan (Bulan/Tahun)'), textField(90, 'Pihak yang terlibat dalam intervensi'),
      ]},
    ],
  },
  {
    groups: [
      { title: 'D. RENCANA INTERVENSI LANJUTAN (KOMPLEMENTARITAS)', tone: 'gray', fields: [
        manyField(91, 'Bentuk Layanan (bisa lebih dari 1)', [
          'Program Kewirausahaan', 'Program Perbaikan Rumah melalui Rumah Usaha Sederhana',
          'Program Keluarga Harapan', 'Bantuan dari Dana Hibah', 'Pemberian Alat Bantu',
          'Pelatihan Keterampilan Kerja', 'Lainnya',
        ]),
      ]},
      { title: 'KESIMPULAN/RESUME KASUS', tone: 'beige', fields: [
        { key: 'kesimpulanResumeKasus', label: 'Kesimpulan/Resume Kasus', kind: 'textarea' },
        { key: 'rekomendasiCatatanPetugas', label: 'Rekomendasi/Catatan Petugas', kind: 'textarea' },
      ]},
    ],
  },
];

// Keep the assessment itself on eight intentional pages before four photo appendices.
// Reuse the official question groups so no question, answer option, or official wording is lost.
const pages: OfficialPage[] = [
  { hasLetterhead: true, groups: sourcePages[0].groups.slice(0, 4) }, // Page 1: assessment header and addresses (1–15)
  { groups: [sourcePages[0].groups[4], sourcePages[1].groups[0]] }, // Page 2: identity and basic status (16–29)
  { groups: [sourcePages[1].groups[1]] }, // Page 3: PPKS caregiver (30–43)
  { groups: sourcePages[2].groups }, // Page 4: rapid PPKS conditions (44–51)
  { groups: [sourcePages[3].groups[0]] }, // Page 5: condition categories and physical profile (52–59)
  { groups: sourcePages[3].groups.slice(1) }, // Page 6: social economy and housing (60–71)
  { groups: sourcePages[4].groups.slice(0, 2) }, // Page 7: housing conditions and case plan (72–85)
  { groups: [...sourcePages[4].groups.slice(2), ...sourcePages[5].groups] }, // Page 8: interventions and recommendations (86–91)
];

const emptyAnswers = (): Record<string, AnswerValue> => {
  const values: Record<string, AnswerValue> = { metaSatker: '', metaYear: '', metaSequence: '', q25: '-' };
  for (let n = 1; n <= 91; n++) values['q' + n] = '';
  values.q48 = []; values.q51 = []; values.q52 = []; values.q83 = []; values.q86 = []; values.q91 = [];
  values.kesimpulanResumeKasus = ''; values.rekomendasiCatatanPetugas = '';
  return values;
};

function answersForRecord(record?: PPKSRecord): Record<string, AnswerValue> {
  const values = emptyAnswers();

  // The standalone Form Asesmen Terintegrasi must never hydrate from imported
  // Google Form (including continuation-form) answers stored on officialAssessment.
  // Old manually saved forms wrote all q1..q91 keys; migrate those only when the
  // record is still marked Terintegrasi. New saves always use the dedicated field.
  const legacyKeys = Array.from({ length: 91 }, (_, index) => 'q' + (index + 1));
  const legacyMarkers = [
    'metaSatker',
    'metaYear',
    'metaSequence',
    'kesimpulanResumeKasus',
    'rekomendasiCatatanPetugas',
  ];
  const legacyManualAssessment = record?.officialAssessment &&
    legacyKeys.every((key) => Object.prototype.hasOwnProperty.call(record.officialAssessment, key)) &&
    legacyMarkers.every((key) => Object.prototype.hasOwnProperty.call(record.officialAssessment, key))
    ? record.officialAssessment
    : undefined;
  const savedAssessment = record?.formAsesmenTerintegrasi || legacyManualAssessment;

  if (savedAssessment) {
    Object.entries(savedAssessment).forEach(([key, value]) => {
      // Whitelist keys that belong to this independent form. Ignore arbitrary
      // imported field names even if they exist in an older cached record.
      if (Object.prototype.hasOwnProperty.call(values, key)) values[key] = value;
    });
  }
  if (record) {
    if (!String(values.q16 || '').trim()) values.q16 = record.namaLengkap || '';
    if (!String(values.q23 || '').trim()) values.q23 = record.nik || '';
    if (!String(values.q5 || '').trim()) values.q5 = record.kotaDomisili || '';
    if (!String(values.q19 || '').trim()) values.q19 = record.jenisKelamin || '';
    // The master record stores one address (current domicile); do not assume it is also the KTP address.
    if (!String(values.q15 || '').trim()) values.q15 = record.alamatLengkap || '';
    if (!String(values.q25 || '').trim()) values.q25 = '-';
  }
  return values;
}

export const FromAsesmenTerintegrasiView: React.FC<FromAsesmenTerintegrasiViewProps> = ({ ppksList, onSaveAssessment, initialSelectedPPKSId, onBeforePrint }) => {
  const [selectedPPKSId, setSelectedPPKSId] = useState<string>(() =>
    initialSelectedPPKSId && ppksList.some((record) => record.id === initialSelectedPPKSId)
      ? initialSelectedPPKSId
      : ppksList[0]?.id || ''
  );
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>(() => answersForRecord(ppksList.find((record) => record.id === selectedPPKSId)));
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string; driveUrl?: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [driveArchive, setDriveArchive] = useState<{ status: 'complete' | 'failed'; error: string; fileId: string; webViewLink: string; savedAt: string } | null>(null);
  const [printPhotoUrls, setPrintPhotoUrls] = useState<Record<string, string>>({});
  const [printPhotoErrors, setPrintPhotoErrors] = useState<Record<string, string>>({});
  const [previewPhotoUrls, setPreviewPhotoUrls] = useState<Record<string, string>>({});
  const [previewPhotoErrors, setPreviewPhotoErrors] = useState<Record<string, string>>({});
  const [previewPhotoLoading, setPreviewPhotoLoading] = useState(false);
  const [preparingPrint, setPreparingPrint] = useState(false);
  const printObjectUrlsRef = useRef<string[]>([]);
  const previewObjectUrlsRef = useRef<string[]>([]);

  const releasePrintPhotoUrls = () => {
    printObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    printObjectUrlsRef.current = [];
  };

  const releasePreviewPhotoUrls = (urlsToRelease?: string[]) => {
    const urls = urlsToRelease ?? [...previewObjectUrlsRef.current];
    urls.forEach((url) => URL.revokeObjectURL(url));
    const released = new Set(urls);
    previewObjectUrlsRef.current = previewObjectUrlsRef.current.filter((url) => !released.has(url));
  };

  useEffect(() => () => {
    // Revoke private Drive photo blobs when navigating away from the assessment menu.
    printObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    printObjectUrlsRef.current = [];
    previewObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewObjectUrlsRef.current = [];
  }, []);

  useEffect(() => {
    if (ppksList.some((record) => record.id === selectedPPKSId)) return;
    const next = ppksList[0];
    setSelectedPPKSId(next?.id || '');
    setAnswers(answersForRecord(next));
  }, [ppksList, selectedPPKSId]);

  const currentPPKS = useMemo(() => ppksList.find((record) => record.id === selectedPPKSId), [ppksList, selectedPPKSId]);

  useEffect(() => {
    let active = true;
    setDriveArchive(null);
    if (!currentPPKS) return () => { active = false; };
    void getIntegratedAssessmentBackupMetadata(currentPPKS.id)
      .then((metadata) => { if (active) setDriveArchive(metadata); })
      .catch((error) => {
        if (active) console.warn('SIPANDU could not load Drive archive status:', error);
      });
    return () => { active = false; };
  }, [currentPPKS?.id]);

  const choosePPKS = (id: string) => {
    if (isSaving) return;
    releasePrintPhotoUrls();
    setPrintPhotoUrls({});
    setPrintPhotoErrors({});
    setSelectedPPKSId(id);
    setAnswers(answersForRecord(ppksList.find((record) => record.id === id)));
    setStatusMessage(null);
  };

  const updateAnswer = (key: string, value: AnswerValue) => {
    if (isSaving) return;
    setAnswers((current) => ({ ...current, [key]: value }));
    setStatusMessage(null);
  };

  const handleReset = () => {
    if (isSaving) return;
    if (!currentPPKS) {
      setAnswers(emptyAnswers());
      setStatusMessage({ type: 'success', text: 'Formulir kosong. Pilih responden ketika data tersedia.' });
      return;
    }
    if (!window.confirm('Kosongkan semua jawaban asesmen untuk responden terpilih? Nama dan NIK master PPKS tetap dipertahankan.')) return;
    const blank = emptyAnswers();
    blank.q16 = currentPPKS.namaLengkap || '';
    blank.q23 = currentPPKS.nik || '';
    blank.q9 = currentPPKS.alamatLengkap || '';
    blank.q15 = currentPPKS.alamatLengkap || '';
    setAnswers(blank);
    setStatusMessage({ type: 'success', text: 'Isian asesmen dikosongkan. Tekan Simpan Form agar perubahan tersimpan.' });
  };

  const handleSave = async () => {
    if (isSaving) return;
    if (!currentPPKS) {
      setStatusMessage({ type: 'error', text: 'Pilih responden PPKS terlebih dahulu. Form tidak disimpan ke data contoh.' });
      return;
    }
    const nikFromForm = typeof answers.q23 === 'string' ? answers.q23.replace(/\D/g, '') : '';
    if (nikFromForm && !/^\d{16}$/.test(nikFromForm)) {
      setStatusMessage({ type: 'error', text: 'NIK harus terdiri dari 16 digit. Periksa kolom 23 NIK sebelum menyimpan.' });
      return;
    }
    const clean: Record<string, AnswerValue> = {};
    Object.entries(answers).forEach(([key, value]) => {
      clean[key] = Array.isArray(value) ? value.filter(Boolean) : String(value ?? '');
    });

    // Save only the independent answer field; spreadsheet-owned profile data stays unchanged.
    const updated: PPKSRecord = {
      ...currentPPKS,
      formAsesmenTerintegrasi: clean,
    };

    setIsSaving(true);
    setStatusMessage(null);
    try {
      // The callback resolves only after Firestore confirms the remote write.
      await onSaveAssessment(updated);

      // Keep a portable archive copy in the central SIPANDU Google Drive.
      // Firestore remains the application source of truth, so a Drive outage
      // cannot erase an assessment that has already been committed.
      try {
        const driveCopy = await backupAssessmentToCentralDrive({
          ppksId: currentPPKS.id,
          ppksName: currentPPKS.namaLengkap || currentPPKS.id,
          nik: currentPPKS.nik || (typeof clean.q23 === 'string' ? clean.q23 : ''),
          answers: clean,
        });
        try {
          await saveIntegratedAssessmentBackupMetadata(currentPPKS.id, {
            status: 'complete',
            fileId: driveCopy.id,
            webViewLink: driveCopy.webViewLink,
          });
          setDriveArchive({
            status: 'complete',
            error: '',
            fileId: driveCopy.id,
            webViewLink: driveCopy.webViewLink || '',
            savedAt: new Date().toISOString(),
          });
          setStatusMessage({
            type: 'success',
            text: 'Form Asesmen Terintegrasi tersimpan di Firestore dan arsip Google Drive utama SIPANDU.',
            driveUrl: driveCopy.webViewLink,
          });
        } catch (metadataError) {
          // Do not leave a Drive object that SIPANDU cannot track in Firestore.
          try { await deleteCentralDriveFile(driveCopy.id); } catch { /* preserve metadata error */ }
          throw metadataError;
        }
      } catch (driveError) {
        const detail = driveError instanceof Error ? driveError.message : String(driveError);
        try {
          await saveIntegratedAssessmentBackupMetadata(currentPPKS.id, {
            status: 'failed',
            error: detail,
          });
          setDriveArchive({
            status: 'failed',
            error: detail,
            fileId: '',
            webViewLink: '',
            savedAt: '',
          });
        } catch (metadataError) {
          console.error('SIPANDU could not record assessment Drive backup failure:', metadataError);
        }
        setStatusMessage({
          type: 'success',
          text: 'Jawaban aman di Firestore, tetapi backup Google Drive belum berhasil: ' + detail + ' Hubungkan ulang akun Google Workspace lalu simpan lagi untuk membuat arsip baru.',
        });
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setStatusMessage({
        type: 'error',
        text: 'Gagal menyimpan Form Asesmen Terintegrasi ke Firebase: ' + detail,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const printablePhotos = [
    { key: 'fotoDiri', title: 'FOTO DIRI PPKS (CLOSE-UP)', source: currentPPKS?.fotoDiri || '' },
    { key: 'fotoKtp', title: 'FOTO KTP', source: currentPPKS?.fotoKtp || '' },
    { key: 'fotoKk', title: 'FOTO KARTU KELUARGA', source: currentPPKS?.fotoKk || '' },
    { key: 'fotoRumah', title: 'FOTO RUMAH TAMPAK DEPAN', source: currentPPKS?.fotoRumah || '' },
  ];

  const getDriveFileId = (value: string): string | null => {
    const trimmed = value.trim();
    const markdownLink = trimmed.match(/\]\((https?:\/\/[^)]+)\)/);
    const source = (markdownLink?.[1] || trimmed.match(/https?:\/\/[^\s,;]+/i)?.[0] || trimmed)
      .replace(/[)\]}>.,]+$/, '');
    const pathId = source.match(/\/(?:file\/)?d\/([a-zA-Z0-9_-]{15,})/);
    if (pathId) return pathId[1];
    const filesPath = source.match(/\/drive\/u\/\d+\/files\/([a-zA-Z0-9_-]{15,})/);
    if (filesPath) return filesPath[1];
    const queryId = source.match(/[?&](?:id|fileId)=([a-zA-Z0-9_-]{15,})/);
    if (queryId && /drive\.google\.com|docs\.google\.com/i.test(source)) return queryId[1];
    if (/^[a-zA-Z0-9_-]{20,}$/.test(source)) return source;
    return null;
  };

  const resolvePhotoForPrint = async (source: string, purpose: 'print' | 'preview' = 'print'): Promise<{ url: string; error: string; temporary: boolean }> => {
    const trimmed = source.trim();
    if (!trimmed) return { url: '', error: 'Foto belum tersedia di sumber data responden.', temporary: false };

    const fileId = getDriveFileId(trimmed);
    if (!fileId) {
      if (/^data:image\//i.test(trimmed)) {
        const imageBlob = await fetch(trimmed).then((response) => response.blob());
        const url = URL.createObjectURL(imageBlob);
        if (purpose === 'preview') previewObjectUrlsRef.current.push(url);
        else printObjectUrlsRef.current.push(url);
        return { url, error: '', temporary: true };
      }
      if (/^https?:\/\//i.test(trimmed)) {
        try {
          const response = await fetch(trimmed);
          if (!response.ok) throw new Error('HTTP ' + response.status);
          const sourceBlob = await response.blob();
          const previewBlob = await createPhotoPreviewBlob(sourceBlob, trimmed.split('/').pop() || 'photo', sourceBlob.type);
          const url = URL.createObjectURL(previewBlob);
          if (purpose === 'preview') previewObjectUrlsRef.current.push(url);
          else printObjectUrlsRef.current.push(url);
          return { url, error: '', temporary: true };
        } catch {
          // A public direct image URL can still be rendered by the browser even
          // when its server does not permit cross-origin reads for conversion.
          return { url: trimmed, error: '', temporary: false };
        }
      }
      return { url: '', error: 'Kolom sumber tidak berisi URL gambar atau ID file Google Drive yang dikenali.', temporary: false };
    }

    let token = await getAccessToken();
    if (!token) token = await refreshWorkspaceAccessToken();
    if (!token) {
      return { url: '', error: 'SIPANDU telah mencoba menyegarkan token otomatis. Hubungkan akun Google Workspace jika foto privat masih tidak dapat dibaca.', temporary: false };
    }

    const authorizedFetch = async (url: string) => {
      let response = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
      if (response.status === 401) {
        invalidateAccessToken();
        const refreshedToken = await refreshWorkspaceAccessToken(true);
        if (refreshedToken) {
          token = refreshedToken;
          response = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
        }
      }
      return response;
    };

    const metadataResponse = await authorizedFetch(
      'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) + '?fields=id,name,mimeType,size'
    );
    if (!metadataResponse.ok) {
      const payload = await metadataResponse.json().catch(() => ({}));
      const message = (payload as { error?: { message?: string } }).error?.message;
      return {
        url: '',
        error: metadataResponse.status === 401
          ? 'Token Google ditolak setelah percobaan refresh otomatis.'
          : metadataResponse.status === 403
            ? 'Akun Google tidak memiliki izin membaca file ini. Periksa akses file di Drive.'
            : message || 'Metadata file Google Drive tidak dapat dibaca (HTTP ' + metadataResponse.status + ').',
        temporary: false,
      };
    }
    const metadata = await metadataResponse.json() as { name?: string; mimeType?: string; size?: string };
    const fileName = metadata.name || 'photo';
    const mimeType = metadata.mimeType || '';
    if (Number(metadata.size || 0) > MAX_PPKS_PHOTO_FILE_BYTES) {
      return { url: '', error: 'Ukuran file lebih dari 30 MB. File tidak diproses agar memori ponsel tetap aman.', temporary: false };
    }

    const mediaUrl = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) + '?alt=media';
    const response = await authorizedFetch(mediaUrl);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const message = (payload as { error?: { message?: string } }).error?.message;
      return {
        url: '',
        error: response.status === 401
          ? 'Token Google ditolak setelah percobaan refresh otomatis. Coba cetak kembali setelah sinkronisasi token selesai.'
          : response.status === 403
            ? 'Akun Google tidak memiliki izin untuk membuka file ini. Periksa akses file di Drive.'
            : message || 'Google Drive tidak dapat membaca foto (HTTP ' + response.status + ').',
        temporary: false,
      };
    }

    const downloadedBlob = await response.blob();
    if (downloadedBlob.size > MAX_PPKS_PHOTO_FILE_BYTES) {
      return { url: '', error: 'Ukuran file lebih dari 30 MB. File tidak diproses agar memori ponsel tetap aman.', temporary: false };
    }
    const previewBlob = await createPhotoPreviewBlob(downloadedBlob, fileName, mimeType || downloadedBlob.type);
    const url = URL.createObjectURL(previewBlob);
    if (purpose === 'preview') previewObjectUrlsRef.current.push(url);
    else printObjectUrlsRef.current.push(url);
    return { url, error: '', temporary: true };
  };

  useEffect(() => {
    let active = true;
    const effectPreviewUrls: string[] = [];
    setPreviewPhotoUrls({});
    setPreviewPhotoErrors({});
    if (!currentPPKS) {
      setPreviewPhotoLoading(false);
      return () => { active = false; releasePreviewPhotoUrls(); };
    }

    setPreviewPhotoLoading(true);
    const loadPreviewPhotos = async () => {
      const urls: Record<string, string> = {};
      const errors: Record<string, string> = {};
      await Promise.all(printablePhotos.map(async (photo) => {
        try {
          const resolved = await resolvePhotoForPrint(photo.source, 'preview');
          if (resolved.temporary && resolved.url.startsWith('blob:')) effectPreviewUrls.push(resolved.url);
          if (resolved.url) urls[photo.key] = resolved.url;
          if (resolved.error) errors[photo.key] = resolved.error;
        } catch (error) {
          errors[photo.key] = error instanceof Error ? error.message : String(error);
        }
      }));
      if (!active) {
        releasePreviewPhotoUrls(effectPreviewUrls);
        return;
      }
      setPreviewPhotoUrls(urls);
      setPreviewPhotoErrors(errors);
      setPreviewPhotoLoading(false);
    };
    void loadPreviewPhotos();

    return () => {
      active = false;
      releasePreviewPhotoUrls(effectPreviewUrls);
    };
  }, [
    currentPPKS?.id,
    currentPPKS?.fotoDiri,
    currentPPKS?.fotoKtp,
    currentPPKS?.fotoKk,
    currentPPKS?.fotoRumah,
  ]);

  const handlePrint = async () => {
    if (!currentPPKS) {
      setStatusMessage({ type: 'error', text: 'Pilih responden PPKS terlebih dahulu agar lembar asesmen dan empat lampiran foto terikat pada responden yang benar.' });
      return;
    }
    setPreparingPrint(true);
    setStatusMessage(null);
    releasePrintPhotoUrls();

    try {
      if (onBeforePrint) {
        const cleanAnswers: Record<string, string | string[]> = {};
        Object.entries(answers).forEach(([key, value]) => {
          cleanAnswers[key] = Array.isArray(value) ? value.filter(Boolean) : String(value ?? '');
        });
        const identityOnly = new Set(['q5', 'q15', 'q16', 'q19', 'q23', 'q25']);
        const hasMeaningfulAnswers = Object.entries(cleanAnswers).some(([key, value]) => {
          if (identityOnly.has(key.toLowerCase())) return false;
          return Array.isArray(value)
            ? value.some((item) => String(item ?? '').trim() !== '')
            : String(value ?? '').trim() !== '';
        });
        if (hasMeaningfulAnswers) {
          // A printed form is also archived in Firestore, even when the user did not press Save Form first.
          await onBeforePrint({ ...currentPPKS, formAsesmenTerintegrasi: cleanAnswers });
          setStatusMessage({ type: 'success', text: 'Form berhasil diarsipkan ke database SIPANDU. Menyiapkan dokumen untuk dicetak…' });
        }
      }

    const urls: Record<string, string> = {};
    const errors: Record<string, string> = {};
    try {
      // Always prepare all four photo appendices. Missing files get an explicit
      // explanation page instead of a blank sheet.
      await Promise.all(printablePhotos.map(async (photo) => {
        try {
          const resolved = await resolvePhotoForPrint(photo.source);
          if (resolved.url) urls[photo.key] = resolved.url;
          if (resolved.error) errors[photo.key] = resolved.error;
        } catch (error) {
          errors[photo.key] = error instanceof Error ? error.message : String(error);
        }
      }));

      setPrintPhotoUrls(urls);
      setPrintPhotoErrors(errors);
      // Allow React to render the print appendices before checking their images.
      await new Promise<void>((resolve) => requestAnimationFrame(() =>
        requestAnimationFrame(() => resolve())
      ));

      const shell = document.querySelector('.official-assessment-shell');
      const images = shell ? Array.from(shell.querySelectorAll('img')) : [];
      await Promise.all(images.map((image) => {
        if (image.complete && image.naturalWidth > 0) return Promise.resolve();
        return new Promise<void>((resolve) => {
          let finished = false;
          const finish = () => {
            if (finished) return;
            finished = true;
            window.clearTimeout(timer);
            image.removeEventListener('load', finish);
            image.removeEventListener('error', finish);
            resolve();
          };
          const timer = window.setTimeout(finish, 3500);
          image.addEventListener('load', finish, { once: true });
          image.addEventListener('error', finish, { once: true });
        });
      }));
      if (document.fonts?.ready) await document.fonts.ready;

      if (!shell) throw new Error('Area Form Asesmen Terintegrasi tidak ditemukan untuk dicetak.');

      // Print a dedicated clone directly under <body>. The old approach hid
      // every element outside <main> and assumed a particular React DOM tree;
      // on mobile Chrome this could leave the print renderer with blank pages.
      // A self-contained root makes the PDF independent of dashboard wrappers.
      const printRootId = 'sipandu-official-print-root';
      document.getElementById(printRootId)?.remove();
      const printRoot = document.createElement('div');
      printRoot.id = printRootId;
      const printClone = shell.cloneNode(true) as HTMLElement;

      // React-controlled form values are DOM properties; copy them explicitly
      // because cloneNode alone does not preserve every live input/checked value.
      const sourceControls = Array.from(shell.querySelectorAll('input, textarea, select'));
      const targetControls = Array.from(printClone.querySelectorAll('input, textarea, select'));
      sourceControls.forEach((sourceControl, index) => {
        const targetControl = targetControls[index];
        if (!targetControl) return;
        if (sourceControl instanceof HTMLInputElement && targetControl instanceof HTMLInputElement) {
          targetControl.value = sourceControl.value;
          targetControl.checked = sourceControl.checked;
          if (sourceControl.checked) targetControl.setAttribute('checked', '');
          else targetControl.removeAttribute('checked');
          if (sourceControl.value) targetControl.setAttribute('value', sourceControl.value);
          else targetControl.removeAttribute('value');
        } else if (sourceControl instanceof HTMLTextAreaElement && targetControl instanceof HTMLTextAreaElement) {
          targetControl.value = sourceControl.value;
          targetControl.textContent = sourceControl.value;
        } else if (sourceControl instanceof HTMLSelectElement && targetControl instanceof HTMLSelectElement) {
          targetControl.selectedIndex = sourceControl.selectedIndex;
          Array.from(targetControl.options).forEach((option, optionIndex) => {
            option.selected = optionIndex === sourceControl.selectedIndex;
            if (option.selected) option.setAttribute('selected', '');
            else option.removeAttribute('selected');
          });
        }
      });

      printRoot.appendChild(printClone);
      document.body.appendChild(printRoot);
      document.body.classList.add('official-assessment-printing');
      await new Promise<void>((resolve) => requestAnimationFrame(() =>
        requestAnimationFrame(() => resolve())
      ));

      const cloneImages = Array.from(printClone.querySelectorAll('img'));
      await Promise.all(cloneImages.map((image) => {
        if (image.complete && image.naturalWidth > 0) return Promise.resolve();
        return new Promise<void>((resolve) => {
          let finished = false;
          const finish = () => {
            if (finished) return;
            finished = true;
            window.clearTimeout(timer);
            image.removeEventListener('load', finish);
            image.removeEventListener('error', finish);
            resolve();
          };
          const timer = window.setTimeout(finish, 2500);
          image.addEventListener('load', finish, { once: true });
          image.addEventListener('error', finish, { once: true });
        });
      }));

      setPreparingPrint(false);
      try {
        await printCurrentWebView('SIPANDU - Form Asesmen Terintegrasi');
      } catch (nativePrintError) {
        console.warn('SIPANDU native print bridge unavailable; falling back to browser print:', nativePrintError);
        window.print();
      }
    } catch (error) {
      document.body.classList.remove('official-assessment-printing');
      document.getElementById('sipandu-official-print-root')?.remove();
      releasePrintPhotoUrls();
      setPrintPhotoUrls({});
      setPrintPhotoErrors({});
      setPreparingPrint(false);
      setStatusMessage({
        type: 'error',
        text: `Persiapan cetak tidak selesai: ${error instanceof Error ? error.message : String(error)}. Coba cetak kembali.`,
      });
    }
  };

  useEffect(() => {
    const cleanup = () => {
      document.body.classList.remove('official-assessment-printing');
      document.getElementById('sipandu-official-print-root')?.remove();
      releasePrintPhotoUrls();
      setPrintPhotoUrls({});
      setPrintPhotoErrors({});
    };
    window.addEventListener('afterprint', cleanup);
    return () => {
      window.removeEventListener('afterprint', cleanup);
      releasePrintPhotoUrls();
    };
  }, []);

  const renderAnswer = (item: OfficialField) => {
    const value = answers[item.key] ?? (item.key === 'q25' ? '-' : '');
    if (item.kind === 'single' || item.kind === 'multi') {
      const selected = Array.isArray(value) ? value : (String(value) ? [String(value)] : []);
      return (
        <div className="official-options">
          {(item.options || []).map((option, index) => {
            const checked = selected.includes(option);
            return (
              <label className="official-option" key={option}>
                <input
                  type={item.kind === 'multi' ? 'checkbox' : 'radio'}
                  name={item.key}
                  checked={checked}
                  onChange={() => {
                    if (item.kind === 'multi') updateAnswer(item.key, checked ? selected.filter((v) => v !== option) : [...selected, option]);
                    else updateAnswer(item.key, checked ? '' : option);
                  }}
                />
                <span className="official-option-number">{index + 1}.</span><span>{option}</span>
              </label>
            );
          })}
        </div>
      );
    }
    if (item.kind === 'textarea') {
      return <textarea className="official-input official-textarea" rows={3} value={typeof value === 'string' ? value : value.join(', ')} onChange={(event) => updateAnswer(item.key, event.target.value)} aria-label={item.label} />;
    }
    return (
      <input
        className="official-input"
        type={item.kind === 'date' ? 'date' : item.kind === 'number' ? 'number' : 'text'}
        inputMode={[23, 24, 39, 40].includes(item.number || -1) ? 'numeric' : undefined}
        maxLength={[23, 39].includes(item.number || -1) ? 16 : undefined}
        value={typeof value === 'string' ? value : value.join(', ')}
        placeholder={item.placeholder || ''}
        onChange={(event) => updateAnswer(item.key, item.number === 23 || item.number === 39 ? event.target.value.replace(/\D/g, '').slice(0, 16) : event.target.value)}
        aria-label={item.label}
      />
    );
  };

  return (
    <div
      className="official-assessment-shell workspace-page min-h-full text-neutral-900"
      data-no-app-swipe="true"
      aria-label="Area Form Asesmen Terintegrasi. Geser lembar ke kiri atau kanan untuk melihat kolom."
    >
      <div className="official-toolbar mb-4 rounded-2xl border border-white/10 bg-black/30 p-3 sm:p-4 shadow-[0_12px_36px_rgba(0,0,0,0.18)]">
        <div className="mb-3 flex items-center gap-2">
          <FileText className="h-5 w-5 text-sky-300" />
          <div>
            <h2 className="text-base font-black uppercase tracking-wide text-white">Form Asesmen Terintegrasi</h2>
            <p className="text-xs text-neutral-300">Pertanyaan mengikuti PDF resmi yang diberikan, nomor 1–91. Kop surat dikunci dan tidak dapat diedit.</p>
          </div>
        </div>

        {ppksList.length === 0 ? (
          <div role="status" className="mb-3 rounded-lg border border-amber-500/40 bg-amber-950/40 p-3 text-sm text-amber-100">
            Data PPKS belum dimuat. Pilih spreadsheet sumber di Google Workspace & Cloud Hub untuk menampilkan responden.
          </div>
        ) : (
          <label className="mb-3 block text-xs font-semibold text-sky-100">
            Pilih responden PPKS
            <div className="relative mt-1.5">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <select value={selectedPPKSId} onChange={(event) => choosePPKS(event.target.value)} disabled={isSaving} className="w-full rounded-lg border border-sky-500/30 bg-black/60 py-2.5 pl-9 pr-3 text-sm text-white">
                {ppksList.map((record) => <option key={record.id} value={record.id}>{formatPPKSTimestamp(record.timestamp)} — {record.namaLengkap || 'Nama belum tersedia'} — NIK {record.nik || 'belum terpetakan'} — {record.kotaDomisili || 'wilayah belum tersedia'}</option>)}
              </select>
            </div>
          </label>
        )}

        {currentPPKS && (
          <div className="mb-3 grid grid-cols-2 gap-2 rounded-lg border border-white/10 bg-black/30 p-3 text-xs sm:grid-cols-4">
            <div><span className="block text-[10px] text-sky-200">Nama PPKS</span><strong className="break-words text-white">{currentPPKS.namaLengkap || '-'}</strong></div>
            <div><span className="block text-[10px] text-sky-200">NIK (16 digit)</span><strong className="break-words text-white">{currentPPKS.nik || 'Belum terpetakan'}</strong></div>
            <div><span className="block text-[10px] text-sky-200">Kota/Kabupaten</span><strong className="break-words text-white">{currentPPKS.kotaDomisili || '-'}</strong></div>
            <div><span className="block text-[10px] text-sky-200">Status</span><strong className="text-white">{currentPPKS.statusAsesmen}</strong></div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => { void handleSave(); }} disabled={!currentPPKS || isSaving} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
            <Save className="h-4 w-4" /> {isSaving ? 'Menyimpan…' : 'Simpan Form'}
          </button>
          <button type="button" onClick={() => { void handlePrint(); }} disabled={preparingPrint || isSaving || !currentPPKS} className="inline-flex items-center gap-2 rounded-lg border border-sky-400/40 bg-sky-950/50 px-4 py-2 text-xs font-bold text-white disabled:opacity-60">
            <Printer className="h-4 w-4" /> {preparingPrint ? 'Menyiapkan 12 halaman…' : 'Cetak / Simpan PDF'}
          </button>
          <button type="button" onClick={handleReset} disabled={isSaving} className="inline-flex items-center gap-2 rounded-lg border border-rose-400/40 bg-rose-950/40 px-4 py-2 text-xs font-bold text-white">
            <RotateCcw className="h-4 w-4" /> Kosongkan Form
          </button>
        </div>
      </div>

      {driveArchive && (
        <section className={`mb-3 rounded-lg border p-3 text-xs ${driveArchive.status === 'complete' ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-100' : 'border-amber-500/40 bg-amber-950/40 text-amber-100'}`} aria-live="polite">
          <strong>{driveArchive.status === 'complete' ? 'Arsip Google Drive terhubung' : 'Backup Google Drive belum tersedia'}</strong>
          {driveArchive.savedAt && <span className="ml-2 opacity-80">· {new Date(driveArchive.savedAt).toLocaleString('id-ID')}</span>}
          {driveArchive.error && <p className="mt-1 break-words">{driveArchive.error}</p>}
          {driveArchive.webViewLink && <a href={driveArchive.webViewLink} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex font-bold underline underline-offset-2">Buka arsip Google Drive</a>}
        </section>
      )}

      {statusMessage && (
        <div role="status" aria-live="polite" className={'official-status mb-3 rounded-lg border p-3 text-xs ' + (statusMessage.type === 'success' ? 'border-emerald-500/40 bg-emerald-950/50 text-emerald-100' : 'border-rose-500/40 bg-rose-950/50 text-rose-100')}>
          {statusMessage.type === 'success' && <CheckCircle2 className="mr-1 inline h-4 w-4 align-middle" />}
          {statusMessage.text}
          {statusMessage.driveUrl && (
            <a href={statusMessage.driveUrl} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 font-bold underline underline-offset-2">
              Buka arsip Google Drive
            </a>
          )}
        </div>
      )}

      {currentPPKS && (
        <section className="official-photo-gallery" aria-label="Foto PPKS dari data responden">
          <div className="official-photo-gallery-heading">
            <h3>Foto PPKS</h3>
            <p>Foto diambil dari data PPKS yang dipilih dan ikut disertakan pada halaman 9–12 saat dicetak atau disimpan sebagai PDF.</p>
          </div>
          <div className="official-photo-gallery-grid">
            {printablePhotos.map((photo) => (
              <figure className="official-photo-preview-card" key={photo.key}>
                <figcaption>{photo.title}</figcaption>
                <div className="official-photo-preview-frame">
                  {previewPhotoUrls[photo.key] && !previewPhotoErrors[photo.key] ? (
                    <img src={previewPhotoUrls[photo.key]} alt={`${photo.title} — ${currentPPKS.namaLengkap || 'PPKS'}`} loading="lazy" />
                  ) : (
                    <div className="official-photo-preview-message">
                      {previewPhotoLoading
                        ? 'Memuat foto dari data PPKS…'
                        : previewPhotoErrors[photo.key] || 'Foto belum tersedia pada data PPKS ini.'}
                    </div>
                  )}
                </div>
              </figure>
            ))}
          </div>
        </section>
      )}

      {pages.map((page, pageIndex) => (
        <section className="official-page" key={'page-' + pageIndex}>
          {page.hasLetterhead && (
            <>
              <div className="official-letterhead" aria-label="Kop surat resmi Form Asesmen Terintegrasi (terkunci)">
                <div className="official-letterhead-logo official-kemensos-logo">
                  <img
                    src={publicAssetUrl('uploads/Logo Kemensos.png')}
                    alt="Logo resmi Kementerian Sosial Republik Indonesia"
                    loading="eager"
                    decoding="sync"
                  />
                </div>
                <div className="official-letterhead-title">
                  FORM ASESMEN TERINTEGRASI
                  <span>DIREKTORAT JENDERAL REHABILITASI SOSIAL</span>
                </div>
                <div className="official-letterhead-logo official-atensi-logo">
                  <img
                    src={publicAssetUrl('uploads/ATENSI HD.png')}
                    alt="Logo ATENSI resmi"
                    loading="eager"
                    decoding="sync"
                  />
                </div>
              </div>
              <div className="official-letterhead-lock">Kop surat resmi dikunci</div>
              <div className="official-numbering">
                <div className="official-numbering-title">Nomor Kuesioner</div>
                <div className="official-numbering-grid">
                  {[
                    { key: 'metaSatker', label: 'No Urutan Satker' },
                    { key: 'metaYear', label: 'Tahun' },
                    { key: 'metaSequence', label: 'Nomor Urut' },
                  ].map((item) => (
                    <label key={item.key}>{item.label}
                      <input value={String(answers[item.key] ?? '')} onChange={(event) => updateAnswer(item.key, event.target.value)} aria-label={item.label} />
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}

          <table className="official-table">
            <colgroup><col className="col-number" /><col className="col-label" /><col className="col-answer" /></colgroup>
            <tbody>
              {page.groups.map((group, groupIndex) => (
                <React.Fragment key={'group-' + groupIndex}>
                  {group.title && <tr className={'official-group-title ' + (group.tone || 'gray')}><td colSpan={3}>{group.title}</td></tr>}
                  {group.fields.map((item) => (
                    <tr key={item.key}>
                      <td className="question-number">{item.number ?? ''}</td>
                      <td className="question-label">
                        {item.label}
                        {item.optional && <span className="block text-[9px] italic text-neutral-500">[opsional]</span>}
                      </td>
                      <td className="question-answer">{renderAnswer(item)}</td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>

          {pageIndex === 7 && (
            <>
              <p className="official-footer-note">** Perlu melampirkan foto/dokumen. Foto PPKS dapat dilakukan dengan closeup.</p>
              <div className="official-signature"><div>Petugas</div><div className="official-signature-line">( ........................................ )</div></div>
            </>
          )}
        </section>
      ))}

      {currentPPKS && printablePhotos.map((photo, index) => (
        <section className="official-page official-photo-appendix" key={photo.key} aria-label={photo.title}>
          <div className="official-photo-appendix-heading">
            <h2>{photo.title}</h2>
            <p>Form Asesmen Terintegrasi · Halaman {index + 9} dari 12</p>
            <div className="official-photo-respondent">
              <span>Nama PPKS: <strong>{currentPPKS.namaLengkap || '-'}</strong></span>
              <span>NIK: <strong>{currentPPKS.nik || 'Belum terpetakan'}</strong></span>
            </div>
          </div>
          <div className="official-photo-print-frame">
            {printPhotoUrls[photo.key] && !printPhotoErrors[photo.key] ? (
              <img
                src={printPhotoUrls[photo.key]}
                alt={`${photo.title} — ${currentPPKS.namaLengkap}`}
                onError={() => setPrintPhotoErrors((current) => ({
                  ...current,
                  [photo.key]: 'Gambar tidak dapat dimuat. Periksa file sumber dan izin berbagi Google Drive.',
                }))}
              />
            ) : (
              <div className="official-photo-missing">
                <strong>{photo.title}</strong>
                <span>{printPhotoErrors[photo.key] || 'Foto belum tersedia. Halaman lampiran ini sengaja menampilkan keterangan agar hasil cetak tidak kosong.'}</span>
              </div>
            )}
          </div>
        </section>
      ))}
    </div>
  );
};
