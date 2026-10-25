import React, { useState, useEffect } from 'react';
import { PPKSRecord, IntegratedFormData } from '../types';
import {
  FileText,
  Search,
  Upload,
  Printer,
  Save,
  RotateCcw,
  Check,
  CheckCircle2,
  FileCheck,
  Camera,
  Image as ImageIcon,
  Building,
  UserCheck,
  HeartPulse,
  DollarSign,
  Brain,
  Award,
} from 'lucide-react';
import { KemensosLogo } from './KemensosLogo';
import { PrivateDriveImage } from './PrivateDriveImage';

interface FromAsesmenTerintegrasiViewProps {
  ppksList: PPKSRecord[];
  onUpdatePPKS: (updated: PPKSRecord) => void;
}

const defaultEmptyForm: IntegratedFormData = {
  nomorRegistrasi: '',
  noBpjs: '',
  statusPernikahan: '',
  pendidikanTerakhir: '',
  pekerjaan: '',
  kontakDaruratNama: '',
  kontakDaruratHubungan: '',
  kontakDaruratNoHp: '',
  tahunDiagnosa: '',
  faskesPdpRujukan: '',
  statusArv: '',
  regimenArv: '',
  kepatuhanArv: '',
  nilaiCd4Terakhir: '',
  viralLoadTerakhir: '',
  riwayatInfeksiOportunistik: '',
  kendalaAksesPengobatan: '',
  statusKeterbukaanStatus: '',
  dukunganKeluarga: '',
  pengalamanStigmaDiskriminasi: '',
  kondisiTempatTinggal: '',
  kondisiKelayakanRumah: '',
  penghasilanBulanan: '',
  pengeluaranKebutuhanObatNutrisi: '',
  tanggunganKeluarga: 0,
  kepemilikanUsaha: '',
  minatKeterampilanAtensi: '',
  desilKemiskinan: 0,
  skorKecemasan: '',
  skorDepresi: '',
  penerimaanDiri: '',
  doronganBunuhDiri: '',
  kebutuhanKonselingSosial: '',
  rekomendasiBantuanNutrisi: false,
  rekomendasiBantuanModalUsaha: false,
  rekomendasiBantuanMedisTransport: false,
  rekomendasiRujukanRehabilitasi: false,
  catatanIntervensiKhusus: '',
  rencanaAksiPendamping: '',
  jadwalMonitoringBerikutnya: '',
  namaAsesor: '',
  nipAsesor: '',
  supervisorKemensos: '',
};

export const FromAsesmenTerintegrasiView: React.FC<FromAsesmenTerintegrasiViewProps> = ({
  ppksList,
  onUpdatePPKS,
}) => {
  const [selectedPPKSId, setSelectedPPKSId] = useState<string>(ppksList[0]?.id || '');
  const [formData, setFormData] = useState<IntegratedFormData>(
    ppksList[0]?.integratedForm || defaultEmptyForm
  );

  // Photos state
  const [fotoDiri, setFotoDiri] = useState<string>(ppksList[0]?.fotoDiri || '');
  const [fotoKtp, setFotoKtp] = useState<string>(ppksList[0]?.fotoKtp || '');
  const [fotoKk, setFotoKk] = useState<string>(ppksList[0]?.fotoKk || '');
  const [fotoRumah, setFotoRumah] = useState<string>(ppksList[0]?.fotoRumah || '');

  const [activeSheetTab, setActiveSheetTab] = useState<number>(1);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);

  const currentPPKS = ppksList.find((p) => p.id === selectedPPKSId);

  // The view may stay mounted while Google Sheets data is imported in the overlay.
  // If its previous selection was empty/removed, automatically select the first
  // real respondent so the integrated form updates without requiring navigation.
  useEffect(() => {
    const selectedStillExists = ppksList.some((record) => record.id === selectedPPKSId);
    if (selectedStillExists) return;
    const first = ppksList[0];
    if (!first) {
      setSelectedPPKSId('');
      setFormData(defaultEmptyForm);
      setFotoDiri('');
      setFotoKtp('');
      setFotoKk('');
      setFotoRumah('');
      return;
    }
    setSelectedPPKSId(first.id);
    setFormData(first.integratedForm || {
      ...defaultEmptyForm,
      nomorRegistrasi: first.id ? `REG-${first.id}` : '',
    });
    setFotoDiri(first.fotoDiri || '');
    setFotoKtp(first.fotoKtp || '');
    setFotoKk(first.fotoKk || '');
    setFotoRumah(first.fotoRumah || '');
  }, [ppksList, selectedPPKSId]);

  // Handle selecting a PPKS from horizontal search
  const handleSelectPPKS = (id: string) => {
    setSelectedPPKSId(id);
    const target = ppksList.find((p) => p.id === id);
    if (target) {
      setFormData(target.integratedForm || {
        ...defaultEmptyForm,
        nomorRegistrasi: `REG-${target.id}`,
      });
      setFotoDiri(target.fotoDiri);
      setFotoKtp(target.fotoKtp);
      setFotoKk(target.fotoKk || '');
      setFotoRumah(target.fotoRumah || '');
    }
  };

  // Tombol Kosongkan Form (di tengah)
  const handleResetForm = () => {
    if (window.confirm('Kosongkan semua isian formulir asesmen untuk responden ini?')) {
      setFormData({
        ...defaultEmptyForm,
        nomorRegistrasi: `REG-MANUAL-${Date.now().toString().slice(-4)}`,
      });
    }
  };

  const handleFieldChange = (key: keyof IntegratedFormData, value: any) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    if (!currentPPKS) return;
    const updated: PPKSRecord = {
      ...currentPPKS,
      integratedForm: formData,
      fotoDiri,
      fotoKtp,
      fotoKk,
      fotoRumah,
      statusAsesmen: 'Terintegrasi',
    };
    onUpdatePPKS(updated);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleTriggerPrint = () => {
    window.print();
  };

  const handleCustomPhotoUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'diri' | 'ktp' | 'kk' | 'rumah'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const url = event.target?.result as string;
      if (type === 'diri') setFotoDiri(url);
      if (type === 'ktp') setFotoKtp(url);
      if (type === 'kk') setFotoKk(url);
      if (type === 'rumah') setFotoRumah(url);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6 pb-28 text-white">
      {/* PDF RESMI — From Asesmen Terintegrasi */}


      {/* Bingkai Judul: From Asesmen Terintegrasi */}
      <div className="p-5 md:p-6 rounded-2xl bg-black/40 border border-rose-500/40 shadow-[0_0_24px_rgba(244,63,94,0.18)]">
        {/* Judul From Asesmen Terintegrasi */}
        <div className="text-center mb-6 pb-4 border-b border-rose-500/25">
          <h2 className="text-xl md:text-2xl font-black text-white tracking-widest uppercase inline-block px-6 py-1.5 rounded-xl bg-emerald-950/90 border border-emerald-500/40 shadow-md">
            FROM ASESMEN TERINTEGRASI
          </h2>
          <p className="text-xs text-sky-200 mt-2">
            Instrumen Resmi Asesmen Komprehensif PPKS ODHIV Kementerian Sosial RI (Formulir 6 Lembar & 12 Halaman Dokumen Standar)
          </p>
        </div>

        {ppksList.length === 0 && (
          <div role="status" className="mb-5 rounded-xl border border-amber-500/40 bg-amber-950/40 p-4 text-sm text-amber-100">
            <h3 className="font-bold">Data PPKS / Asesmen belum dimuat</h3>
            <p className="mt-1 text-xs text-amber-100/90">
              Form ini mengambil daftar responden dari data SIPANDU. Buka Google Workspace & Cloud Hub → Google Sheets → pilih spreadsheet sumber yang benar, lalu tekan “Muat Data PPKS + Asesmen”. Setelah impor berhasil, nama responden akan muncul di pilihan ini otomatis.
            </p>
          </div>
        )}

        {/* Menu horizontal: mencari/menggulir nama PPKS yang sudah tersinkron ke aplikasi */}
        <div className="mb-6">
          <label className="block text-xs font-bold text-sky-200 mb-2 uppercase tracking-wider flex items-center gap-2">
            <Search className="w-4 h-4 text-sky-300" />
            <span>Pilih / Gulir Nama PPKS Tersinkron:</span>
          </label>
          <div className="relative">
            <select
              value={selectedPPKSId}
              onChange={(e) => handleSelectPPKS(e.target.value)}
              disabled={ppksList.length === 0}
              className="w-full py-3 px-4 rounded-xl bg-[#142618] border border-rose-500/45 text-white font-medium text-sm focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400 shadow-md cursor-pointer transition disabled:opacity-60"
            >
              {ppksList.length === 0 && <option value="">Belum ada data PPKS yang dimuat</option>}
              {ppksList.map((p) => (
                <option key={p.id} value={p.id} className="bg-[#0f1d12] text-white py-1">
                  {p.namaLengkap} • NIK: {p.nik} • {p.kotaDomisili} (Status: {p.statusAsesmen})
                </option>
              ))}
            </select>
          </div>
          {currentPPKS && (
            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 rounded-xl border border-sky-400/25 bg-sky-950/20 p-3 text-xs">
              <div><span className="block text-[10px] uppercase tracking-wide text-sky-200">Nama PPKS</span><strong className="block break-words text-white">{currentPPKS.namaLengkap || '-'}</strong></div>
              <div><span className="block text-[10px] uppercase tracking-wide text-sky-200">NIK</span><strong className="block break-words text-white">{currentPPKS.nik || '-'}</strong></div>
              <div><span className="block text-[10px] uppercase tracking-wide text-sky-200">Nomor HP/WA</span><strong className="block break-words text-white">{currentPPKS.noHpWa || '-'}</strong></div>
              <div><span className="block text-[10px] uppercase tracking-wide text-sky-200">Kabupaten/Kota</span><strong className="block break-words text-white">{currentPPKS.kotaDomisili || '-'}</strong></div>
            </div>
          )}
        </div>

        {/* Ketika user memilih salah satu nama ppks, pada halaman akan muncul foto dengan urutan:
            Foto Diri       ->>          Foto KTP
            Foto KK        ->>          Foto Rumah Tampak Depan */}
        <div className="mb-4 p-3 md:p-4 rounded-xl bg-black/50 border border-rose-500/35">
          <div className="flex items-center justify-between mb-3 border-b border-rose-500/20 pb-2">
            <h4 className="text-xs md:text-sm font-bold text-sky-200 uppercase tracking-wider flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-sky-300" />
              <span>Lampiran Berkas Foto Responden (Urutan Wajib)</span>
            </h4>
            <span className="text-[10px] text-neutral-400 font-mono">
              Foto Diri → KTP → KK → Rumah Tampak Depan
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 md:gap-3">
            {/* 1. Foto Diri */}
            <div className="flex min-w-0 flex-col items-center p-2 rounded-lg bg-black/60 border border-emerald-500/30">
              <span className="text-xs font-bold text-emerald-300 mb-2">1. Foto Diri</span>
              <div className="w-full aspect-[4/3] rounded-md overflow-hidden border border-rose-500/30 bg-black">
                <PrivateDriveImage source={fotoDiri} alt="Foto Diri" className="h-full w-full rounded-none border-0" objectFit="contain" />
              </div>
              <label className="mt-1.5 text-[9px] md:text-[10px] text-sky-300 hover:underline cursor-pointer flex items-center gap-1">
                <Upload className="w-3 h-3" />
                <span>Ganti Foto Diri</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleCustomPhotoUpload(e, 'diri')}
                  className="hidden"
                />
              </label>
            </div>

            {/* 2. Foto KTP */}
            <div className="flex flex-col items-center p-3 rounded-xl bg-black/60 border border-emerald-500/30">
              <span className="text-xs font-bold text-emerald-300 mb-2">2. Foto KTP</span>
              <div className="w-full aspect-3/4 rounded-lg overflow-hidden border border-rose-500/30 bg-black">
                <PrivateDriveImage source={fotoKtp} alt="Foto KTP" className="h-full w-full rounded-none border-0" objectFit="contain" />
              </div>
              <label className="mt-2 text-[10px] text-sky-300 hover:underline cursor-pointer flex items-center gap-1">
                <Upload className="w-3 h-3" />
                <span>Ganti Foto KTP</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleCustomPhotoUpload(e, 'ktp')}
                  className="hidden"
                />
              </label>
            </div>

            {/* 3. Foto KK */}
            <div className="flex flex-col items-center p-3 rounded-xl bg-black/60 border border-emerald-500/30">
              <span className="text-xs font-bold text-emerald-300 mb-2">3. Foto KK</span>
              <div className="w-full aspect-3/4 rounded-lg overflow-hidden border border-rose-500/30 bg-black">
                <PrivateDriveImage source={fotoKk} alt="Foto KK" className="h-full w-full rounded-none border-0" objectFit="contain" />
              </div>
              <label className="mt-2 text-[10px] text-sky-300 hover:underline cursor-pointer flex items-center gap-1">
                <Upload className="w-3 h-3" />
                <span>Ganti Foto KK</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleCustomPhotoUpload(e, 'kk')}
                  className="hidden"
                />
              </label>
            </div>

            {/* 4. Foto Rumah Tampak Depan */}
            <div className="flex flex-col items-center p-3 rounded-xl bg-black/60 border border-emerald-500/30">
              <span className="text-xs font-bold text-emerald-300 mb-2">
                4. Foto Rumah Tampak Depan
              </span>
              <div className="w-full aspect-3/4 rounded-lg overflow-hidden border border-rose-500/30 bg-black">
                <PrivateDriveImage source={fotoRumah} alt="Foto Rumah Tampak Depan" className="h-full w-full rounded-none border-0" objectFit="contain" />
              </div>
              <label className="mt-2 text-[10px] text-sky-300 hover:underline cursor-pointer flex items-center gap-1">
                <Upload className="w-3 h-3" />
                <span>Ganti Foto Rumah</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleCustomPhotoUpload(e, 'rumah')}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Tombol Kosongkan Form (berada di tengah) */}
        <div className="my-6 text-center">
          <button
            type="button"
            onClick={handleResetForm}
            className="py-2.5 px-6 rounded-xl font-bold text-xs uppercase tracking-wider text-rose-200 bg-rose-950/70 hover:bg-rose-900 border border-rose-500/50 shadow-md inline-flex items-center gap-2 cursor-pointer active:scale-95 transition"
          >
            <RotateCcw className="w-4 h-4 text-rose-400" />
            <span>Tombol Kosongkan Form</span>
          </button>
        </div>

        {/* Template From Asesmen Terintegrasi 6 lembar yang bisa diisi oleh user saat asesmen ke lapangan */}
        <div className="p-5 md:p-6 rounded-2xl bg-black/60 border border-rose-500/40">
          {/* Sub-tabs untuk memilih lembar form (1-6) */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-3 mb-5 border-b border-rose-500/25 no-scrollbar">
            {[1, 2, 3, 4, 5, 6].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => setActiveSheetTab(num)}
                className={`py-2 px-3 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                  activeSheetTab === num
                    ? 'bg-emerald-800 text-white border border-rose-500/50 shadow-sm'
                    : 'bg-black/40 text-neutral-400 hover:text-white border border-transparent'
                }`}
              >
                Lembar {num}
              </button>
            ))}
          </div>

          {/* LEMBAR 1: Identitas & Administrasi PPKS */}
          {activeSheetTab === 1 && (
            <div className="space-y-4">
              <div className="border-b border-rose-500/20 pb-2">
                <h4 className="text-sm font-bold text-sky-200 uppercase">
                  LEMBAR 1: Identitas & Administrasi PPKS ODHIV
                </h4>
                <p className="text-[11px] text-neutral-300">
                  Data legalitas kependudukan, kepesertaan jaminan kesehatan, dan kontak darurat pendamping.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-neutral-300 font-semibold mb-1">
                    Nomor Registrasi Asesmen:
                  </label>
                  <input
                    type="text"
                    value={formData.nomorRegistrasi}
                    onChange={(e) => handleFieldChange('nomorRegistrasi', e.target.value)}
                    placeholder="REG-ODHIV-MDN-001"
                    className="w-full p-2 rounded bg-black/70 border border-rose-500/30 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-neutral-300 font-semibold mb-1">
                    No. BPJS Kesehatan / KIS:
                  </label>
                  <input
                    type="text"
                    value={formData.noBpjs}
                    onChange={(e) => handleFieldChange('noBpjs', e.target.value)}
                    placeholder="0001xxxxxxxxxx"
                    className="w-full p-2 rounded bg-black/70 border border-rose-500/30 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-neutral-300 font-semibold mb-1">
                    Status Pernikahan:
                  </label>
                  <select
                    value={formData.statusPernikahan}
                    onChange={(e) => handleFieldChange('statusPernikahan', e.target.value)}
                    className="w-full p-2 rounded bg-black/70 border border-rose-500/30 text-white"
                  >
                    <option value="Belum Menikah">Belum Menikah</option>
                    <option value="Menikah (Pasangan Positif)">Menikah (Pasangan Positif)</option>
                    <option value="Menikah (Pasangan Negatif/Diskordan)">Menikah (Pasangan Negatif/Diskordan)</option>
                    <option value="Cerai Mati (Pasangan Meninggal Akibat HIV)">Cerai Mati (Pasangan Meninggal Akibat HIV)</option>
                    <option value="Cerai Hidup">Cerai Hidup</option>
                  </select>
                </div>

                <div>
                  <label className="block text-neutral-300 font-semibold mb-1">
                    Pekerjaan Saat Ini:
                  </label>
                  <input
                    type="text"
                    value={formData.pekerjaan}
                    onChange={(e) => handleFieldChange('pekerjaan', e.target.value)}
                    placeholder="Buruh, Pedagang, Ojek, dsb."
                    className="w-full p-2 rounded bg-black/70 border border-rose-500/30 text-white"
                  />
                </div>

                <div>
                  <label className="block text-neutral-300 font-semibold mb-1">
                    Nama Kontak Darurat:
                  </label>
                  <input
                    type="text"
                    value={formData.kontakDaruratNama}
                    onChange={(e) => handleFieldChange('kontakDaruratNama', e.target.value)}
                    placeholder="Nama orang tua/pasangan/kerabat"
                    className="w-full p-2 rounded bg-black/70 border border-rose-500/30 text-white"
                  />
                </div>

                <div>
                  <label className="block text-neutral-300 font-semibold mb-1">
                    No. HP Kontak Darurat:
                  </label>
                  <input
                    type="text"
                    value={formData.kontakDaruratNoHp}
                    onChange={(e) => handleFieldChange('kontakDaruratNoHp', e.target.value)}
                    placeholder="0812xxxxxxxx"
                    className="w-full p-2 rounded bg-black/70 border border-rose-500/30 text-white font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {/* LEMBAR 2: Kondisi Medis & Riwayat Pengobatan ODHIV */}
          {activeSheetTab === 2 && (
            <div className="space-y-4">
              <div className="border-b border-rose-500/20 pb-2">
                <h4 className="text-sm font-bold text-sky-200 uppercase">
                  LEMBAR 2: Kondisi Medis & Riwayat Terapi ARV
                </h4>
                <p className="text-[11px] text-neutral-300">
                  Riwayat diagnosis, faskes PDP, kepatuhan minum obat, viral load, dan riwayat infeksi oportunistik.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-neutral-300 font-semibold mb-1">
                    Tahun Diagnosa Pertama:
                  </label>
                  <input
                    type="text"
                    value={formData.tahunDiagnosa}
                    onChange={(e) => handleFieldChange('tahunDiagnosa', e.target.value)}
                    placeholder="Contoh: 2023"
                    className="w-full p-2 rounded bg-black/70 border border-rose-500/30 text-white"
                  />
                </div>

                <div>
                  <label className="block text-neutral-300 font-semibold mb-1">
                    Faskes PDP Rujukan (Klinik ARV):
                  </label>
                  <input
                    type="text"
                    value={formData.faskesPdpRujukan}
                    onChange={(e) => handleFieldChange('faskesPdpRujukan', e.target.value)}
                    placeholder="RSUP H. Adam Malik / RSUD Pirngadi / Puskesmas"
                    className="w-full p-2 rounded bg-black/70 border border-rose-500/30 text-white"
                  />
                </div>

                <div>
                  <label className="block text-neutral-300 font-semibold mb-1">
                    Status Pengobatan ARV:
                  </label>
                  <select
                    value={formData.statusArv}
                    onChange={(e) => handleFieldChange('statusArv', e.target.value)}
                    className="w-full p-2 rounded bg-black/70 border border-rose-500/30 text-white"
                  >
                    <option value="Aktif Minum ARV">Aktif Minum ARV (Rutin)</option>
                    <option value="Sempat Putus Obat / Drop Out">Sempat Putus Obat / Drop Out</option>
                    <option value="Baru Memulai">Baru Memulai</option>
                    <option value="Belum Mau Mulai Pengobatan">Belum Mau Mulai Pengobatan</option>
                  </select>
                </div>

                <div>
                  <label className="block text-neutral-300 font-semibold mb-1">
                    Regimen Obat ARV:
                  </label>
                  <input
                    type="text"
                    value={formData.regimenArv}
                    onChange={(e) => handleFieldChange('regimenArv', e.target.value)}
                    placeholder="TLD / TLE / Aluvia"
                    className="w-full p-2 rounded bg-black/70 border border-rose-500/30 text-white"
                  />
                </div>

                <div>
                  <label className="block text-neutral-300 font-semibold mb-1">
                    Hasil CD4 Terakhir:
                  </label>
                  <input
                    type="text"
                    value={formData.nilaiCd4Terakhir}
                    onChange={(e) => handleFieldChange('nilaiCd4Terakhir', e.target.value)}
                    placeholder="480 sel/mm³"
                    className="w-full p-2 rounded bg-black/70 border border-rose-500/30 text-white"
                  />
                </div>

                <div>
                  <label className="block text-neutral-300 font-semibold mb-1">
                    Hasil Viral Load (VL):
                  </label>
                  <input
                    type="text"
                    value={formData.viralLoadTerakhir}
                    onChange={(e) => handleFieldChange('viralLoadTerakhir', e.target.value)}
                    placeholder="Undetectable (<50 copies/mL) / TND"
                    className="w-full p-2 rounded bg-black/70 border border-rose-500/30 text-white"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-neutral-300 font-semibold mb-1">
                    Riwayat Infeksi Oportunistik (IO) & Kendala Akses:
                  </label>
                  <textarea
                    rows={2}
                    value={formData.riwayatInfeksiOportunistik}
                    onChange={(e) =>
                      handleFieldChange('riwayatInfeksiOportunistik', e.target.value)
                    }
                    placeholder="Pernah TB Paru, Candidiasis, Toksoplasmosis, atau kendala jarak faskes..."
                    className="w-full p-2 rounded bg-black/70 border border-rose-500/30 text-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* LEMBAR 3: Profil Sosial & Kondisi Keluarga / Tempat Tinggal */}
          {activeSheetTab === 3 && (
            <div className="space-y-4">
              <div className="border-b border-rose-500/20 pb-2">
                <h4 className="text-sm font-bold text-sky-200 uppercase">
                  LEMBAR 3: Profil Sosial & Kondisi Tempat Tinggal
                </h4>
                <p className="text-[11px] text-neutral-300">
                  Tingkat keterbukaan status, dukungan keluarga, stigma lingkungan, dan kelayakan hunian.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-neutral-300 font-semibold mb-1">
                    Status Keterbukaan HIV:
                  </label>
                  <select
                    value={formData.statusKeterbukaanStatus}
                    onChange={(e) =>
                      handleFieldChange('statusKeterbukaanStatus', e.target.value)
                    }
                    className="w-full p-2 rounded bg-black/70 border border-rose-500/30 text-white"
                  >
                    <option value="Terbuka Penuh ke Keluarga">Terbuka Penuh ke Keluarga</option>
                    <option value="Hanya Pasangan Yang Tahu">Hanya Pasangan Yang Tahu</option>
                    <option value="Sangat Tertutup / Rahasia">Sangat Tertutup / Rahasia</option>
                    <option value="Terbuka ke Komunitas/KDS">Terbuka ke Komunitas/KDS</option>
                  </select>
                </div>

                <div>
                  <label className="block text-neutral-300 font-semibold mb-1">
                    Dukungan Keluarga Inti:
                  </label>
                  <select
                    value={formData.dukunganKeluarga}
                    onChange={(e) => handleFieldChange('dukunganKeluarga', e.target.value)}
                    className="w-full p-2 rounded bg-black/70 border border-rose-500/30 text-white"
                  >
                    <option value="Sangat Mendukung">Sangat Mendukung (Mendampingi)</option>
                    <option value="Mendukung Pasif">Mendukung Pasif</option>
                    <option value="Netral">Netral</option>
                    <option value="Ada Penolakan / Diskriminasi">Ada Penolakan / Diskriminasi</option>
                  </select>
                </div>

                <div>
                  <label className="block text-neutral-300 font-semibold mb-1">
                    Status Kepemilikan Tempat Tinggal:
                  </label>
                  <input
                    type="text"
                    value={formData.kondisiTempatTinggal}
                    onChange={(e) => handleFieldChange('kondisiTempatTinggal', e.target.value)}
                    placeholder="Sewa/Kontrak, Milik Sendiri, Menumpang Ortu"
                    className="w-full p-2 rounded bg-black/70 border border-rose-500/30 text-white"
                  />
                </div>

                <div>
                  <label className="block text-neutral-300 font-semibold mb-1">
                    Kelayakan Fisik Rumah:
                  </label>
                  <input
                    type="text"
                    value={formData.kondisiKelayakanRumah}
                    onChange={(e) =>
                      handleFieldChange('kondisiKelayakanRumah', e.target.value)
                    }
                    placeholder="Dinding semen/papan, lantai semen, ventilasi cukup"
                    className="w-full p-2 rounded bg-black/70 border border-rose-500/30 text-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* LEMBAR 4: Kondisi Ekonomi & Penghidupan */}
          {activeSheetTab === 4 && (
            <div className="space-y-4">
              <div className="border-b border-rose-500/20 pb-2">
                <h4 className="text-sm font-bold text-sky-200 uppercase">
                  LEMBAR 4: Kondisi Ekonomi & Penghidupan
                </h4>
                <p className="text-[11px] text-neutral-300">
                  Penghasilan, pengeluaran nutrisi pendukung, tanggungan, dan potensi kewirausahaan Atensi.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-neutral-300 font-semibold mb-1">
                    Estimasi Penghasilan Bulanan:
                  </label>
                  <input
                    type="text"
                    value={formData.penghasilanBulanan}
                    onChange={(e) => handleFieldChange('penghasilanBulanan', e.target.value)}
                    placeholder="Contoh: Rp 1.500.000"
                    className="w-full p-2 rounded bg-black/70 border border-rose-500/30 text-white"
                  />
                </div>

                <div>
                  <label className="block text-neutral-300 font-semibold mb-1">
                    Pengeluaran Nutrisi & Transport Medis:
                  </label>
                  <input
                    type="text"
                    value={formData.pengeluaranKebutuhanObatNutrisi}
                    onChange={(e) =>
                      handleFieldChange('pengeluaranKebutuhanObatNutrisi', e.target.value)
                    }
                    placeholder="Contoh: Rp 400.000"
                    className="w-full p-2 rounded bg-black/70 border border-rose-500/30 text-white"
                  />
                </div>

                <div>
                  <label className="block text-neutral-300 font-semibold mb-1">
                    Jumlah Tanggungan Keluarga:
                  </label>
                  <input
                    type="number"
                    value={formData.tanggunganKeluarga}
                    onChange={(e) =>
                      handleFieldChange('tanggunganKeluarga', parseInt(e.target.value, 10) || 1)
                    }
                    className="w-full p-2 rounded bg-black/70 border border-rose-500/30 text-white"
                  />
                </div>

                <div>
                  <label className="block text-neutral-300 font-semibold mb-1">
                    Minat Keterampilan / Usaha Mandiri:
                  </label>
                  <input
                    type="text"
                    value={formData.minatKeterampilanAtensi}
                    onChange={(e) =>
                      handleFieldChange('minatKeterampilanAtensi', e.target.value)
                    }
                    placeholder="Perbengkelan, Tata Boga, Menjahit, Warung Sembako"
                    className="w-full p-2 rounded bg-black/70 border border-rose-500/30 text-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* LEMBAR 5: Asesmen Psikososial & Kesehatan Mental */}
          {activeSheetTab === 5 && (
            <div className="space-y-4">
              <div className="border-b border-rose-500/20 pb-2">
                <h4 className="text-sm font-bold text-sky-200 uppercase">
                  LEMBAR 5: Asesmen Psikososial & Kesehatan Mental
                </h4>
                <p className="text-[11px] text-neutral-300">
                  Evaluasi tingkat kecemasan, depresi, penerimaan diri, dan kebutuhan konseling sosial.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-neutral-300 font-semibold mb-1">
                    Tingkat Kecemasan:
                  </label>
                  <select
                    value={formData.skorKecemasan}
                    onChange={(e) => handleFieldChange('skorKecemasan', e.target.value)}
                    className="w-full p-2 rounded bg-black/70 border border-rose-500/30 text-white"
                  >
                    <option value="Normal">Normal (Tidak Ada Kecemasan Signifikan)</option>
                    <option value="Ringan">Ringan (Kekhawatiran Finansial/Anak)</option>
                    <option value="Sedang">Sedang (Sering Gelisah/Insomnia)</option>
                    <option value="Berat">Berat (Perlu Pendampingan Psikiatri)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-neutral-300 font-semibold mb-1">
                    Tingkat Depresi:
                  </label>
                  <select
                    value={formData.skorDepresi}
                    onChange={(e) => handleFieldChange('skorDepresi', e.target.value)}
                    className="w-full p-2 rounded bg-black/70 border border-rose-500/30 text-white"
                  >
                    <option value="Normal">Normal</option>
                    <option value="Ringan">Ringan</option>
                    <option value="Sedang">Sedang</option>
                    <option value="Berat">Berat</option>
                  </select>
                </div>

                <div>
                  <label className="block text-neutral-300 font-semibold mb-1">
                    Penerimaan Diri Terhadap Status:
                  </label>
                  <input
                    type="text"
                    value={formData.penerimaanDiri}
                    onChange={(e) => handleFieldChange('penerimaanDiri', e.target.value)}
                    placeholder="Menerima dengan baik / Masih syok / Bersemangat pulih"
                    className="w-full p-2 rounded bg-black/70 border border-rose-500/30 text-white"
                  />
                </div>

                <div>
                  <label className="block text-neutral-300 font-semibold mb-1">
                    Riwayat Pikiran Melukai Diri:
                  </label>
                  <select
                    value={formData.doronganBunuhDiri}
                    onChange={(e) => handleFieldChange('doronganBunuhDiri', e.target.value)}
                    className="w-full p-2 rounded bg-black/70 border border-rose-500/30 text-white"
                  >
                    <option value="Tidak Pernah">Tidak Pernah (Aman)</option>
                    <option value="Pernah di Awal Diagnosa">Pernah di Awal Diagnosa (Sekarang Stabil)</option>
                    <option value="Jarang Muncul">Jarang Muncul</option>
                    <option value="Perlu Pengawasan Ketat">Perlu Pengawasan Ketat (High Risk)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* LEMBAR 6: Rencana Intervensi & Rekomendasi Program Atensi Kemensos */}
          {activeSheetTab === 6 && (
            <div className="space-y-4">
              <div className="border-b border-rose-500/20 pb-2">
                <h4 className="text-sm font-bold text-sky-200 uppercase">
                  LEMBAR 6: Rencana Intervensi & Rekomendasi Program Atensi Kemensos
                </h4>
                <p className="text-[11px] text-neutral-300">
                  Pemberian bantuan pemenuhan hidup layak, modal kewirausahaan, serta pengesahan asesor lapangan.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-black/70 border border-emerald-500/30 space-y-2 text-xs">
                <span className="font-bold text-emerald-300 block mb-1">
                  Rekomendasi Klaster Bantuan ATENSI:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      style={{ accentColor: "#000000", width: "1.2rem", height: "1.2rem", border: "2px solid #000" }}
                      checked={formData.rekomendasiBantuanNutrisi}
                      onChange={(e) =>
                        handleFieldChange('rekomendasiBantuanNutrisi', e.target.checked)
                      }
                      className="rounded accent-emerald-500"
                    />
                    <span>Bantuan Paket Nutrisi & Sembako (3 Bulan)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      style={{ accentColor: "#000000", width: "1.2rem", height: "1.2rem", border: "2px solid #000" }}
                      checked={formData.rekomendasiBantuanModalUsaha}
                      onChange={(e) =>
                        handleFieldChange('rekomendasiBantuanModalUsaha', e.target.checked)
                      }
                      className="rounded accent-emerald-500"
                    />
                    <span>Bantuan Stimulan Modal Kewirausahaan</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      style={{ accentColor: "#000000", width: "1.2rem", height: "1.2rem", border: "2px solid #000" }}
                      checked={formData.rekomendasiBantuanMedisTransport}
                      onChange={(e) =>
                        handleFieldChange('rekomendasiBantuanMedisTransport', e.target.checked)
                      }
                      className="rounded accent-emerald-500"
                    />
                    <span>Fasilitasi Biaya Transportasi Kontrol ARV</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      style={{ accentColor: "#000000", width: "1.2rem", height: "1.2rem", border: "2px solid #000" }}
                      checked={formData.rekomendasiRujukanRehabilitasi}
                      onChange={(e) =>
                        handleFieldChange('rekomendasiRujukanRehabilitasi', e.target.checked)
                      }
                      className="rounded accent-emerald-500"
                    />
                    <span>Rujukan Sentra Rehabilitasi Sosial Kemensos</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-neutral-300 font-semibold mb-1">
                    Nama Asesor Pendamping:
                  </label>
                  <input
                    type="text"
                    value={formData.namaAsesor}
                    onChange={(e) => handleFieldChange('namaAsesor', e.target.value)}
                    className="w-full p-2 rounded bg-black/70 border border-rose-500/30 text-white"
                  />
                </div>

                <div>
                  <label className="block text-neutral-300 font-semibold mb-1">
                    NIP Asesor Pendamping:
                  </label>
                  <input
                    type="text"
                    value={formData.nipAsesor}
                    onChange={(e) => handleFieldChange('nipAsesor', e.target.value)}
                    className="w-full p-2 rounded bg-black/70 border border-rose-500/30 text-white font-mono"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-neutral-300 font-semibold mb-1">
                    Catatan Intervensi Khusus:
                  </label>
                  <textarea
                    rows={2}
                    value={formData.catatanIntervensiKhusus}
                    onChange={(e) =>
                      handleFieldChange('catatanIntervensiKhusus', e.target.value)
                    }
                    placeholder="Tuliskan rekomendasi spesifik intervensi lapangan Kemensos..."
                    className="w-full p-2 rounded bg-black/70 border border-rose-500/30 text-white"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Dibawah form ke 6:
            SIMPAN (sebelah kiri)        ---->>>>         CETAK PDF (sebelah kanan) */}
        <div className="mt-8 pt-6 border-t border-rose-500/30 flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* SIMPAN (sebelah kiri) */}
          <div className="w-full sm:w-auto">
            <button
              type="button"
              onClick={handleSave}
              className="w-full sm:w-64 py-3.5 px-6 rounded-xl font-bold text-xs md:text-sm uppercase tracking-wider text-white bg-gradient-to-r from-[#1e4423] to-[#122e15] hover:from-[#28572e] hover:to-[#1a401e] border-2 border-rose-500/60 shadow-[0_0_18px_rgba(244,63,94,0.25)] flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition"
            >
              <Save className="w-4 h-4 text-sky-300" />
              <span>SIMPAN FORMULIR</span>
            </button>
            {saveSuccess && (
              <p className="mt-1.5 text-[11px] text-emerald-300 font-medium flex items-center gap-1">
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Formulir berhasil disimpan ke database!</span>
              </p>
            )}
          </div>

          {/* Info status 12 lembar dokumen */}
          <div className="text-center sm:text-right text-[11px] text-sky-200">
            <span className="font-semibold block">Dokumen Standar Cetak: Tepat 12 Halaman</span>
            <span className="text-neutral-400">
              Hal 1-8: Form Asesmen • Hal 9: Foto Diri • Hal 10: KTP • Hal 11: KK • Hal 12: Rumah
            </span>
          </div>

          {/* CETAK PDF (sebelah kanan) */}
          <div className="w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setShowPrintModal(true)}
              className="w-full sm:w-64 py-3.5 px-6 rounded-xl font-bold text-xs md:text-sm uppercase tracking-wider text-white bg-gradient-to-r from-emerald-700 via-teal-700 to-sky-700 hover:from-emerald-600 hover:to-sky-600 border-2 border-rose-500/60 shadow-[0_0_20px_rgba(56,189,248,0.3)] flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition"
            >
              <Printer className="w-4 h-4 text-white" />
              <span>CETAK PDF (12 HALAMAN)</span>
            </button>
          </div>
        </div>
      </div>

      {/* MODAL PRINT PREVIEW & CETAK PDF RESMI 12 HALAMAN */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/90 p-4 md:p-6 select-none text-neutral-900">
          <div className="print-container max-w-4xl mx-auto bg-white rounded-2xl shadow-2xl p-6 md:p-8 flex flex-col space-y-6">
            {/* Modal header with action buttons */}
            <div className="flex items-center justify-between pb-4 border-b border-neutral-300 no-print">
              <div>
                <h3 className="text-base md:text-lg font-bold text-neutral-900">
                  Pratinjau Dokumen Cetak Form Asesmen Terintegrasi
                </h3>
                <p className="text-xs text-neutral-600">
                  Struktur dokumen tepat 12 halaman berurutan sesuai pedoman resmi Kemensos RI.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTriggerPrint}
                  className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-md"
                >
                  <Printer className="w-4 h-4" />
                  <span>Cetak Dokumen Sekarang</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowPrintModal(false)}
                  className="px-3 py-2 rounded-xl bg-neutral-200 hover:bg-neutral-300 text-neutral-800 text-xs font-bold"
                >
                  Tutup
                </button>
              </div>
            </div>

            {/* Document Pages Container (12 Pages sequentially) */}
            <div className="space-y-8 font-sans text-xs">
              {/* HALAMAN 1 - 8: Form Asesmen Terintegrasi */}
              <div className="p-6 border border-neutral-300 rounded-xl bg-neutral-50 shadow-sm page-break">
                <div className="text-center border-b-2 border-neutral-800 pb-3 mb-4">
                  <span className="text-[10px] uppercase font-bold text-neutral-600 tracking-widest">
                    KEMENTERIAN SOSIAL REPUBLIK INDONESIA
                  </span>
                  <h4 className="text-base font-extrabold text-neutral-900 tracking-wide uppercase">
                    FORMULIR ASESMEN TERINTEGRASI PPKS ODHIV
                  </h4>
                  <p className="text-xs text-neutral-600">
                    Direktorat Rehabilitasi Sosial Korban Penyalahgunaan Narkoba & ODHIV
                  </p>
                  <p className="text-[10px] text-neutral-500 font-mono mt-1">
                    No. Dokumen: KEMENSOS-SU-ODHIV-2026 • Halaman 1 dari 12
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="bg-white p-3 rounded border border-neutral-200">
                    <span className="font-bold text-neutral-800 block mb-2 border-b pb-1">
                      BAGIAN A: IDENTITAS & REGISTRASI PPKS (HALAMAN 1-2)
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div><strong>Nama Responden:</strong> {currentPPKS?.namaLengkap}</div>
                      <div><strong>NIK:</strong> {currentPPKS?.nik}</div>
                      <div><strong>Nomor Registrasi:</strong> {formData.nomorRegistrasi}</div>
                      <div><strong>Usia / Jenis Kelamin:</strong> {currentPPKS?.usia} Thn / {currentPPKS?.jenisKelamin}</div>
                      <div><strong>No. BPJS/KIS:</strong> {formData.noBpjs || '—'}</div>
                      <div><strong>Status Pernikahan:</strong> {formData.statusPernikahan}</div>
                      <div><strong>Kota Domisili:</strong> {currentPPKS?.kotaDomisili}</div>
                      <div><strong>No. HP/WA:</strong> {currentPPKS?.noHpWa}</div>
                    </div>
                  </div>

                  <div className="bg-white p-3 rounded border border-neutral-200">
                    <span className="font-bold text-neutral-800 block mb-2 border-b pb-1">
                      BAGIAN B: KONDISI MEDIS & KEPATUHAN ARV (HALAMAN 3-4)
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div><strong>Tahun Diagnosa:</strong> {formData.tahunDiagnosa || '—'}</div>
                      <div><strong>Faskes PDP Rujukan:</strong> {formData.faskesPdpRujukan || '—'}</div>
                      <div><strong>Status Terapi ARV:</strong> {formData.statusArv}</div>
                      <div><strong>Regimen ARV:</strong> {formData.regimenArv}</div>
                      <div><strong>Nilai CD4 Terakhir:</strong> {formData.nilaiCd4Terakhir || '—'}</div>
                      <div><strong>Viral Load:</strong> {formData.viralLoadTerakhir || '—'}</div>
                    </div>
                  </div>

                  <div className="bg-white p-3 rounded border border-neutral-200">
                    <span className="font-bold text-neutral-800 block mb-2 border-b pb-1">
                      BAGIAN C: ASESMEN SOSIAL & EKONOMI (HALAMAN 5-6)
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div><strong>Desil DTKS:</strong> Desil {formData.desilKemiskinan}</div>
                      <div><strong>Penghasilan:</strong> {formData.penghasilanBulanan || '—'}</div>
                      <div><strong>Tempat Tinggal:</strong> {formData.kondisiTempatTinggal}</div>
                      <div><strong>Dukungan Keluarga:</strong> {formData.dukunganKeluarga}</div>
                    </div>
                  </div>

                  <div className="bg-white p-3 rounded border border-neutral-200">
                    <span className="font-bold text-neutral-800 block mb-2 border-b pb-1">
                      BAGIAN D: PENGESAHAN & REKOMENDASI ATENSI (HALAMAN 7-8)
                    </span>
                    <p className="text-[11px] mb-3">
                      Berdasarkan asesmen komprehensif, PPKS berhak diusulkan menerima Program ATENSI Kemensos klaster ODHIV berupa pemenuhan hidup layak, nutrisi, dan stimulan modal mandiri.
                    </p>
                    <div className="grid grid-cols-2 gap-4 text-center text-[11px] pt-4 border-t">
                      <div>
                        <p className="font-medium">Mengetahui/Menerima,</p>
                        <p className="text-neutral-500">Penerima Manfaat (PPKS)</p>
                        <div className="h-14 flex items-end justify-center font-bold">
                          ({currentPPKS?.namaLengkap})
                        </div>
                      </div>
                      <div>
                        <p className="font-medium">Petugas Asesor Kemensos,</p>
                        <p className="text-neutral-500">Pendamping ODHIV Prov. Sumut</p>
                        <div className="h-14 flex items-end justify-center font-bold">
                          ({formData.namaAsesor})
                        </div>
                        <p className="text-[10px] text-neutral-600 font-mono">NIP: {formData.nipAsesor}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* HALAMAN 9: Lampiran I - Foto Diri */}
              <div className="p-6 border border-neutral-300 rounded-xl bg-white page-break flex flex-col items-center justify-center text-center">
                <div className="w-full border-b pb-2 mb-4">
                  <h5 className="font-extrabold text-sm uppercase text-neutral-900">
                    HALAMAN 9: LAMPIRAN I - FOTO DIRI PPKS
                  </h5>
                  <p className="text-[11px] text-neutral-500">
                    Responden: {currentPPKS?.namaLengkap} (NIK: {currentPPKS?.nik})
                  </p>
                </div>
                <div className="w-64 h-80 rounded-lg overflow-hidden border-2 border-neutral-400 bg-neutral-100 p-1">
                  <img src={fotoDiri} alt="Foto Diri" className="w-full h-full object-cover rounded" />
                </div>
                <p className="mt-3 text-[11px] text-neutral-600 font-mono">
                  Dokumentasi verifikasi fisik lapangan terautentikasi Kemensos RI
                </p>
              </div>

              {/* HALAMAN 10: Lampiran II - Foto KTP */}
              <div className="p-6 border border-neutral-300 rounded-xl bg-white page-break flex flex-col items-center justify-center text-center">
                <div className="w-full border-b pb-2 mb-4">
                  <h5 className="font-extrabold text-sm uppercase text-neutral-900">
                    HALAMAN 10: LAMPIRAN II - FOTO KTP PPKS
                  </h5>
                  <p className="text-[11px] text-neutral-500">
                    Kartu Tanda Penduduk Republik Indonesia
                  </p>
                </div>
                <div className="w-80 h-52 rounded-lg overflow-hidden border-2 border-neutral-400 bg-neutral-100 p-1">
                  <img src={fotoKtp} alt="Foto KTP" className="w-full h-full object-cover rounded" />
                </div>
                <p className="mt-3 text-[11px] text-neutral-600 font-mono">
                  Verifikasi NIK: {currentPPKS?.nik} (Sesuai Database Kependudukan)
                </p>
              </div>

              {/* HALAMAN 11: Lampiran III - Foto KK */}
              <div className="p-6 border border-neutral-300 rounded-xl bg-white page-break flex flex-col items-center justify-center text-center">
                <div className="w-full border-b pb-2 mb-4">
                  <h5 className="font-extrabold text-sm uppercase text-neutral-900">
                    HALAMAN 11: LAMPIRAN III - FOTO KK (KARTU KELUARGA)
                  </h5>
                  <p className="text-[11px] text-neutral-500">
                    Dokumen Kartu Keluarga PPKS
                  </p>
                </div>
                <div className="w-96 h-60 rounded-lg overflow-hidden border-2 border-neutral-400 bg-neutral-100 p-1">
                  <img src={fotoKk} alt="Foto KK" className="w-full h-full object-cover rounded" />
                </div>
                <p className="mt-3 text-[11px] text-neutral-600 font-mono">
                  Lampiran Verifikasi Hubungan Keluarga & Tanggungan Sosial
                </p>
              </div>

              {/* HALAMAN 12: Lampiran IV - Foto Rumah Tampak Depan */}
              <div className="p-6 border border-neutral-300 rounded-xl bg-white page-break flex flex-col items-center justify-center text-center">
                <div className="w-full border-b pb-2 mb-4">
                  <h5 className="font-extrabold text-sm uppercase text-neutral-900">
                    HALAMAN 12: LAMPIRAN IV - FOTO RUMAH TAMPAK DEPAN
                  </h5>
                  <p className="text-[11px] text-neutral-500">
                    Dokumentasi Kelayakan Hunian & Kondisi Fisik Lingkungan Tempat Tinggal
                  </p>
                </div>
                <div className="w-96 h-64 rounded-lg overflow-hidden border-2 border-neutral-400 bg-neutral-100 p-1">
                  <img
                    src={fotoRumah}
                    alt="Foto Rumah Tampak Depan"
                    className="w-full h-full object-cover rounded"
                  />
                </div>
                <p className="mt-3 text-[11px] text-neutral-600 font-mono">
                  Alamat: {currentPPKS?.alamatLengkap} ({currentPPKS?.kotaDomisili})
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
