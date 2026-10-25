import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileText, Printer, RotateCcw, Save, Search } from 'lucide-react';
import { PPKSRecord } from '../types';
import '../officialAssessment.css';

type AnswerValue = string | string[];
type FieldKind = 'text' | 'date' | 'number' | 'textarea' | 'single' | 'multi';
interface OfficialField {
  key: string; number?: number; label: string; kind?: FieldKind;
  options?: string[]; optional?: boolean; placeholder?: string;
}
interface OfficialGroup { title?: string; tone?: 'gray' | 'beige' | 'white'; fields: OfficialField[]; }
interface OfficialPage { groups: OfficialGroup[]; hasLetterhead?: boolean; }
interface FromAsesmenTerintegrasiViewProps { ppksList: PPKSRecord[]; onUpdatePPKS: (updated: PPKSRecord) => void; }

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

const pages: OfficialPage[] = [
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

const emptyAnswers = (): Record<string, AnswerValue> => {
  const values: Record<string, AnswerValue> = { metaSatker: '', metaYear: '', metaSequence: '', q25: '-' };
  for (let n = 1; n <= 91; n++) values['q' + n] = '';
  values.q48 = []; values.q51 = []; values.q52 = []; values.q83 = []; values.q86 = []; values.q91 = [];
  values.kesimpulanResumeKasus = ''; values.rekomendasiCatatanPetugas = '';
  return values;
};

function answersForRecord(record?: PPKSRecord): Record<string, AnswerValue> {
  const values = emptyAnswers();
  if (record?.officialAssessment) {
    Object.entries(record.officialAssessment).forEach(([key, value]) => { values[key] = value; });
  }
  if (record) {
    if (!String(values.q16 || '').trim()) values.q16 = record.namaLengkap || '';
    if (!String(values.q23 || '').trim()) values.q23 = record.nik || '';
    if (!String(values.q9 || '').trim()) values.q9 = record.alamatLengkap || '';
    if (!String(values.q15 || '').trim()) values.q15 = record.alamatLengkap || '';
    if (!String(values.q25 || '').trim()) values.q25 = '-';
  }
  return values;
}

export const FromAsesmenTerintegrasiView: React.FC<FromAsesmenTerintegrasiViewProps> = ({ ppksList, onUpdatePPKS }) => {
  const [selectedPPKSId, setSelectedPPKSId] = useState<string>(ppksList[0]?.id || '');
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>(() => answersForRecord(ppksList.find((record) => record.id === selectedPPKSId)));
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (ppksList.some((record) => record.id === selectedPPKSId)) return;
    const next = ppksList[0];
    setSelectedPPKSId(next?.id || '');
    setAnswers(answersForRecord(next));
  }, [ppksList, selectedPPKSId]);

  const currentPPKS = useMemo(() => ppksList.find((record) => record.id === selectedPPKSId), [ppksList, selectedPPKSId]);

  const choosePPKS = (id: string) => {
    setSelectedPPKSId(id);
    setAnswers(answersForRecord(ppksList.find((record) => record.id === id)));
    setStatusMessage(null);
  };

  const updateAnswer = (key: string, value: AnswerValue) => {
    setAnswers((current) => ({ ...current, [key]: value }));
    setStatusMessage(null);
  };

  const handleReset = () => {
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

  const handleSave = () => {
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
    Object.entries(answers).forEach(([key, value]) => { clean[key] = Array.isArray(value) ? value.filter(Boolean) : String(value ?? ''); });
    const updated: PPKSRecord = {
      ...currentPPKS,
      namaLengkap: (typeof clean.q16 === 'string' && clean.q16.trim()) ? clean.q16.trim() : currentPPKS.namaLengkap,
      nik: nikFromForm || currentPPKS.nik || '',
      officialAssessment: clean,
      statusAsesmen: 'Terintegrasi',
    };
    onUpdatePPKS(updated);
    setAnswers(clean);
    setStatusMessage({ type: 'success', text: 'Jawaban Form Asesmen Terintegrasi resmi tersimpan pada data PPKS.' });
  };

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
    <div className="official-assessment-shell text-neutral-900">
      <div className="official-toolbar mb-4 rounded-xl border border-rose-500/30 bg-black/40 p-4">
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
              <select value={selectedPPKSId} onChange={(event) => choosePPKS(event.target.value)} className="w-full rounded-lg border border-sky-500/30 bg-black/60 py-2.5 pl-9 pr-3 text-sm text-white">
                {ppksList.map((record) => <option key={record.id} value={record.id}>{record.namaLengkap || 'Nama belum tersedia'} — NIK {record.nik || 'belum terpetakan'} — {record.kotaDomisili || 'wilayah belum tersedia'}</option>)}
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
          <button type="button" onClick={handleSave} disabled={!currentPPKS} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
            <Save className="h-4 w-4" /> Simpan Form
          </button>
          <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg border border-sky-400/40 bg-sky-950/50 px-4 py-2 text-xs font-bold text-white">
            <Printer className="h-4 w-4" /> Cetak / Simpan PDF
          </button>
          <button type="button" onClick={handleReset} className="inline-flex items-center gap-2 rounded-lg border border-rose-400/40 bg-rose-950/40 px-4 py-2 text-xs font-bold text-white">
            <RotateCcw className="h-4 w-4" /> Kosongkan Form
          </button>
        </div>
      </div>

      {statusMessage && (
        <div role="status" aria-live="polite" className={'official-status mb-3 rounded-lg border p-3 text-xs ' + (statusMessage.type === 'success' ? 'border-emerald-500/40 bg-emerald-950/50 text-emerald-100' : 'border-rose-500/40 bg-rose-950/50 text-rose-100')}>
          {statusMessage.type === 'success' && <CheckCircle2 className="mr-1 inline h-4 w-4 align-middle" />}
          {statusMessage.text}
        </div>
      )}

      {pages.map((page, pageIndex) => (
        <section className="official-page" key={'page-' + pageIndex}>
          {page.hasLetterhead && (
            <>
              <div className="official-letterhead" aria-label="Kop surat resmi Form Asesmen Terintegrasi (terkunci)">
                <div className="official-letterhead-logo">
                  <svg viewBox="0 0 100 100" aria-hidden="true">
                    <path d="M43 76 C38 61 23 49 20 34 C39 40 49 52 50 70" fill="#194a86" />
                    <path d="M45 70 C45 46 53 24 75 12 C71 37 60 55 47 72" fill="#008d45" />
                    <path d="M48 74 C55 51 69 38 87 34 C80 52 67 66 48 74" fill="#009847" />
                    <path d="M46 77 C65 66 81 65 92 69 C76 82 60 83 46 77" fill="#f5c400" />
                    <path d="M42 81 C58 81 72 87 78 93 C57 96 44 90 42 81" fill="#f5c400" />
                    <circle cx="30" cy="20" r="8" fill="#194a86" />
                  </svg>
                  <small>KEMENTERIAN SOSIAL<br />REPUBLIK INDONESIA</small>
                </div>
                <div className="official-letterhead-title">
                  FORM ASESMEN TERINTEGRASI
                  <span>DIREKTORAT JENDERAL REHABILITASI SOSIAL</span>
                </div>
                <div className="official-letterhead-logo">
                  <svg viewBox="0 0 100 100" aria-hidden="true">
                    <ellipse cx="50" cy="42" rx="43" ry="26" fill="none" stroke="#ed1c2e" strokeWidth="5" transform="rotate(-23 50 42)" />
                    <path d="M17 82 L50 22 L82 82 Z" fill="#4d9a87" />
                    <path d="M50 22 L67 54 L50 82 L34 54 Z" fill="#f5cf68" />
                    <path d="M50 22 L67 54 L50 82 L62 82 L85 39 L69 8 Z" fill="#a7b7eb" opacity=".9" />
                  </svg>
                  <div className="official-logo-atensi-text">ATENSI</div>
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

          {pageIndex === 5 && (
            <>
              <p className="official-footer-note">** Perlu melampirkan foto/dokumen. Foto PPKS dapat dilakukan dengan closeup.</p>
              <div className="official-signature"><div>Petugas</div><div className="official-signature-line">( ........................................ )</div></div>
            </>
          )}
        </section>
      ))}
    </div>
  );
};
