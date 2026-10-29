import React, { useState, useEffect } from 'react';
import { PPKSRecord, AppSettings } from '../types';
import { SipanduQRCode } from './SipanduQRCode';
import { GOOGLE_SIPANDU_RESOURCES } from '../lib/googleSIPANDUResources';
import { STAGE_ONE_RESPONDENT_PORTAL_URL } from '../lib/stageOneRespondentPortal';
import { CameraCaptureModal } from './CameraCaptureModal';
import { PrivateDriveImage } from './PrivateDriveImage';
import { compressImageForLocalStorage } from '../lib/imageCompression';
import {
  buildGoogleFormUtamaPrefilledUrl,
  buildWhatsAppMessage,
  createWhatsAppLink,
} from '../utils/helpers';
import {
  FileText,
  ExternalLink,
  QrCode,
  Send,
  Camera,
  Upload,
  MessageCircle,
  CheckCircle,
  Copy,
  Link,
  Database,
  CloudCheck,
} from 'lucide-react';

interface AsesmenViewProps {
  /** Records imported only from the Google Form linked to the stage-one link/barcode. */
  stageOneRespondents: PPKSRecord[];
  stageOneSyncMessage: string;
  onAddNewPPKS: (newPPKS: PPKSRecord) => void;
  settings: AppSettings;
}



type AsesmenSubMenu = 'tahap-awal' | 'google-form';

export const AsesmenView: React.FC<AsesmenViewProps> = ({
  stageOneRespondents,
  stageOneSyncMessage,
  onAddNewPPKS,
  settings,
}) => {
  const [activeSubMenu, setActiveSubMenu] = useState<AsesmenSubMenu>('tahap-awal');

  // Form states for ASESMEN TAHAP AWAL
  const [namaLengkap, setNamaLengkap] = useState<string>('');
  const [nik, setNik] = useState<string>('');
  const [usia, setUsia] = useState<string>('');
  const [jenisKelamin, setJenisKelamin] = useState<'Laki-laki' | 'Perempuan' | ''>('');
  const [kotaDomisili, setKotaDomisili] = useState<string>('');
  const [fotoDiri, setFotoDiri] = useState<string>('');
  const [fotoDiriName, setFotoDiriName] = useState<string>('');
  const [fotoKtp, setFotoKtp] = useState<string>('');
  const [fotoKtpName, setFotoKtpName] = useState<string>('');
  const [jenisBantuan, setJenisBantuan] = useState<string>('');
  const [noHpWa, setNoHpWa] = useState<string>('');

  // Camera modal states
  const [isCameraOpen, setIsCameraOpen] = useState<boolean>(false);
  const [cameraTarget, setCameraTarget] = useState<'fotoDiri' | 'fotoKtp'>('fotoDiri');

  useEffect(() => {
    const onAppNavigateBack = (event: Event) => {
      const detail = (event as CustomEvent<{ handled: boolean }>).detail;
      if (!detail || detail.handled) return;
      if (isCameraOpen) {
        setIsCameraOpen(false);
        detail.handled = true;
        return;
      }
      if (activeSubMenu !== 'tahap-awal') {
        setActiveSubMenu('tahap-awal');
        detail.handled = true;
      }
    };
    window.addEventListener('sipandu:navigate-back', onAppNavigateBack);
    return () => window.removeEventListener('sipandu:navigate-back', onAppNavigateBack);
  }, [activeSubMenu, isCameraOpen]);

  // Submission feedback
  const [formSubmitted, setFormSubmitted] = useState<boolean>(false);
  const [copyFeedback, setCopyFeedback] = useState<string>('');
  const [copyError, setCopyError] = useState<string>('');
  const [photoUploadError, setPhotoUploadError] = useState('');
  const [isCompressingPhoto, setIsCompressingPhoto] = useState(false);

  // The public stage-one URL opens the respondent interface inside SIPANDU, never Google Forms.
  const stageOneRespondentUrl = STAGE_ONE_RESPONDENT_PORTAL_URL;

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'fotoDiri' | 'fotoKtp'
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setPhotoUploadError('');
    setIsCompressingPhoto(true);
    try {
      // Keeps KTP legible while keeping data URLs below Firestore's document-size
      // limit and preventing mobile localStorage quota failures.
      const result = await compressImageForLocalStorage(file, 1200, 320 * 1024);
      if (type === 'fotoDiri') {
        setFotoDiri(result);
        setFotoDiriName(file.name);
      } else {
        setFotoKtp(result);
        setFotoKtpName(file.name);
      }
    } catch (error) {
      setPhotoUploadError(error instanceof Error ? error.message : 'Foto tidak dapat diproses.');
    } finally {
      setIsCompressingPhoto(false);
    }
  };

  const openCameraFor = (type: 'fotoDiri' | 'fotoKtp') => {
    setCameraTarget(type);
    setIsCameraOpen(true);
  };

  const handleCameraCapture = async (dataUrl: string) => {
    setPhotoUploadError('');
    setIsCompressingPhoto(true);
    try {
      const captured = await fetch(dataUrl).then((response) => response.blob());
      const compressed = await compressImageForLocalStorage(captured, 1200, 320 * 1024);
      if (cameraTarget === 'fotoDiri') {
        setFotoDiri(compressed);
        setFotoDiriName(`Live_Foto_Diri_${Date.now()}.jpg`);
      } else {
        setFotoKtp(compressed);
        setFotoKtpName(`Live_Foto_KTP_${Date.now()}.jpg`);
      }
    } catch (error) {
      setPhotoUploadError(error instanceof Error ? error.message : 'Foto kamera tidak dapat diproses.');
    } finally {
      setIsCompressingPhoto(false);
    }
  };

  const handleSubmitTahapAwal = (e: React.FormEvent) => {
    e.preventDefault();

    const cleanNik = nik.replace(/\D/g, '');
    const parsedAge = Number(usia);
    if (!/^\d{16}$/.test(cleanNik)) {
      alert('NIK harus terdiri dari tepat 16 digit angka. Periksa kembali NIK responden sebelum menyimpan.');
      return;
    }
    if (!Number.isInteger(parsedAge) || parsedAge < 1 || parsedAge > 100) {
      alert('Usia responden wajib diisi dengan angka antara 1 sampai 100 tahun.');
      return;
    }
    if (!namaLengkap.trim() || !kotaDomisili.trim() || !jenisKelamin || !noHpWa.trim()) {
      alert('Lengkapi Nama Lengkap, NIK, Usia, Jenis Kelamin, Kota Domisili, dan No. HP/WA dengan data responden yang sebenarnya.');
      return;
    }

    // Timestamp automatically generated when respondent/user presses complete/kirim
    const now = new Date();
    const formattedTimestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    const newPPKS: PPKSRecord = {
      id: `PPKS-SU-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: formattedTimestamp,
      namaLengkap: namaLengkap.trim(),
      nik: cleanNik,
      usia: parsedAge,
      jenisKelamin: jenisKelamin as PPKSRecord['jenisKelamin'],
      kotaDomisili: kotaDomisili.trim(),
      // Street address, intervention, and DTKS decile stay blank/unregistered
      // unless they were actually supplied or assessed.
      alamatLengkap: '',
      noHpWa: noHpWa.trim(),
      jenisBantuan: jenisBantuan.trim(),
      intervensiMental: '',
      desil: 0,
      // Never insert stock/demo images as a respondent's identity documents.
      // Empty photo fields remain visibly missing until a genuine upload is supplied.
      fotoDiri,
      fotoKtp,
      statusAsesmen: 'Tahap Awal',
      // This staff quick-entry form is not a Google Forms response; the separate form link above is.
    };

    onAddNewPPKS(newPPKS);
    setFormSubmitted(true);

    // Reset form fields
    setNamaLengkap('');
    setNik('');
    setUsia('');
    setJenisBantuan('');
    setNoHpWa('');
    setFotoDiri('');
    setFotoDiriName('');
    setFotoKtp('');
    setFotoKtpName('');
    setKotaDomisili('');
    setJenisKelamin('');

    setTimeout(() => setFormSubmitted(false), 4500);
  };

  const handleCopyLink = async (url: string, label: string) => {
    if (!url.trim()) {
      setCopyFeedback('');
      setCopyError('Tautan formulir belum diatur.');
      window.setTimeout(() => setCopyError(''), 3000);
      return;
    }
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API tidak tersedia di browser ini.');
      }
      await navigator.clipboard.writeText(url);
      setCopyError('');
      setCopyFeedback(label);
    } catch {
      setCopyFeedback('');
      setCopyError('Gagal menyalin tautan. Salin URL secara manual dari kolom formulir.');
    }
    window.setTimeout(() => {
      setCopyFeedback('');
      setCopyError('');
    }, 3000);
  };

  const handleSendWA = (ppks: PPKSRecord) => {
    let prefilledPrimaryFormUrl = '';
    try {
      prefilledPrimaryFormUrl = buildGoogleFormUtamaPrefilledUrl(
        GOOGLE_SIPANDU_RESOURCES.formRespondentUrl,
        settings.googleFormUtamaPrefillEntries,
        ppks,
      );
    } catch (error) {
      alert(error instanceof Error
        ? error.message + '\\n\\nBuka Pengaturan SIPANDU dan masukkan entry ID asli dari Google Form utama. Jangan menebak nomor entry.'
        : String(error));
      return;
    }

    const message = buildWhatsAppMessage(ppks, {
      googleFormUtamaPrefilledUrl: prefilledPrimaryFormUrl,
      senderName: settings.senderName,
      senderRole: settings.senderRole,
      senderUnit: settings.senderUnit,
      googleFormTahapLanjutanUrl: settings.googleFormTahapLanjutanUrl,
      googleFormTahapLanjutanIdEntry: settings.googleFormTahapLanjutanIdEntry,
      googleFormKesehatanMentalUrl: settings.googleFormKesehatanMentalUrl,
    });
    const link = createWhatsAppLink(ppks.noHpWa, message);
    window.open(link, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-8 pb-28 text-white">
      {/* Bingkai Luar: Judul ASESMEN tepat di tengah */}
      <div className="p-5 md:p-6 rounded-2xl bg-black/40 border border-rose-500/40 shadow-[0_0_22px_rgba(244,63,94,0.18)]">
        {/* Judul ASESMEN tepat di tengah */}
        <div className="text-center mb-6 pb-4 border-b border-rose-500/25">
          <h2 className="text-xl md:text-2xl font-black text-white tracking-widest uppercase inline-block px-6 py-1.5 rounded-xl bg-emerald-950/90 border border-emerald-500/40 shadow-md">
            ASESMEN
          </h2>
          <p className="text-xs text-sky-200 mt-2">
            Layanan Formulir & Barcode Terintegrasi Google Form, Google Spreadsheet, dan Google Drive
          </p>
        </div>

        {/* 3 Tombol Sub-menu Asesmen */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
          <button
            type="button"
            onClick={() => setActiveSubMenu('tahap-awal')}
            className={`py-3 px-4 rounded-xl font-bold text-xs md:text-sm uppercase tracking-wider transition cursor-pointer flex items-center justify-center gap-2 ${
              activeSubMenu === 'tahap-awal'
                ? 'bg-gradient-to-r from-emerald-800 to-teal-800 text-white border-2 border-rose-500/60 shadow-[0_0_15px_rgba(244,63,94,0.25)]'
                : 'bg-black/50 text-neutral-300 hover:text-white border border-rose-500/25 hover:bg-emerald-950/40'
            }`}
          >
            <FileText className="w-4 h-4 text-sky-300" />
            <span>ASESMEN TAHAP AWAL</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubMenu('google-form')}
            className={`py-3 px-4 rounded-xl font-bold text-xs md:text-sm uppercase tracking-wider transition cursor-pointer flex items-center justify-center gap-2 ${
              activeSubMenu === 'google-form'
                ? 'bg-gradient-to-r from-emerald-800 to-teal-800 text-white border-2 border-rose-500/60 shadow-[0_0_15px_rgba(244,63,94,0.25)]'
                : 'bg-black/50 text-neutral-300 hover:text-white border border-rose-500/25 hover:bg-emerald-950/40'
            }`}
          >
            <Link className="w-4 h-4 text-sky-300" />
            <span>GOOGLE FORM UTAMA</span>
          </button>


        </div>

        {/* 1. KONTEN: ASESMEN TAHAP AWAL */}
        {activeSubMenu === 'tahap-awal' && (
          <div className="space-y-6">
            {isCompressingPhoto && (
              <div role="status" className="rounded-lg border border-sky-400/30 bg-sky-950/40 p-3 text-xs text-sky-100">
                Memproses dan mengompres foto agar dapat disimpan dengan aman…
              </div>
            )}
            {photoUploadError && (
              <div role="alert" className="rounded-lg border border-rose-400/40 bg-rose-950/40 p-3 text-xs text-rose-100">
                {photoUploadError}
              </div>
            )}
            {/* Link & Barcode dengan Logo SIPANDU di dalamnya */}
            <div className="p-5 rounded-2xl bg-[#112415]/70 border border-rose-500/35 flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-emerald-900 text-emerald-200 border border-emerald-400">
                    KEMENSOS RI TAHAP AWAL
                  </span>
                  <span className={`text-xs font-mono ${stageOneRespondentUrl ? 'text-sky-300' : 'text-amber-200'}`}>
                    {stageOneRespondentUrl ? 'FORM SIPANDU AKTIF' : 'FORM SIPANDU TIDAK TERSEDIA'}
                  </span>
                </div>
                <h4 className="text-base font-bold text-white">
                  Tautan & Barcode Asesmen Tahap Awal ODHIV
                </h4>
                <p className="text-xs text-neutral-300 leading-relaxed">
                  Tautan dan barcode ini membuka formulir Asesmen Tahap Awal langsung di SIPANDU. Setelah dikirim, jawaban masuk ke Database PPKS Asesmen Tahap Awal. Google Form utama baru dikirim dari baris responden setelah data tersimpan.
                </p>
                {!stageOneRespondentUrl && (
                  <div role="alert" className="rounded-lg border border-amber-400/40 bg-amber-950/30 p-3 text-xs leading-relaxed text-amber-100">
                    URL Form tahap awal belum diatur. Periksa kembali koneksi Google Workspace bila tautan belum dapat dibuka. Respons yang masuk melalui tautan/barcode tahap awal akan disinkronkan ke DATABASE PPKS ASESMEN TAHAP AWAL.
                  </div>
                )}

                {/* Link Box */}
                <div className="flex items-center gap-2 bg-black/60 p-2 rounded-xl border border-rose-500/30">
                  <input
                    type="text"
                    readOnly
                    value={stageOneRespondentUrl}
                    placeholder="URL Form SIPANDU"
                    className="flex-1 bg-transparent text-xs text-sky-200 font-mono focus:outline-none px-2 select-all"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (stageOneRespondentUrl) handleCopyLink(stageOneRespondentUrl, 'Link Tahap Awal');
                    }}
                    disabled={!stageOneRespondentUrl}
                    className="px-3 py-1.5 rounded-lg bg-emerald-800/80 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Salin</span>
                  </button>
                  <a
                    href={stageOneRespondentUrl || undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-disabled={!stageOneRespondentUrl}
                    onClick={(event) => {
                      if (!stageOneRespondentUrl) event.preventDefault();
                    }}
                    className={`p-1.5 rounded-lg bg-black/40 hover:bg-black/60 text-sky-300 ${stageOneRespondentUrl ? '' : 'pointer-events-none opacity-50'}`}
                    title="Buka Formulir"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
                {copyFeedback && (
                  <p className="text-[11px] text-emerald-300 font-semibold animate-pulse">
                    ✓ {copyFeedback} berhasil disalin ke clipboard!
                  </p>
                )}
              </div>

              {/* Barcode/QR Code with Kemensos logo inside */}
              <div className="flex flex-col items-center">
                <SipanduQRCode
                  value={stageOneRespondentUrl}
                  size={190}
                  label="Scan Barcode Asesmen Tahap Awal"
                  downloadFileName="barcode-asesmen-tahap-awal.png"
                />
              </div>
            </div>

            {/* Form Pertanyaan untuk Asesmen (Responden Baru di Lapangan) */}
            <div className="p-5 md:p-6 rounded-2xl bg-black/50 border border-rose-500/40">
              <div className="flex items-center justify-between pb-3 mb-5 border-b border-rose-500/25">
                <div>
                  <h3 className="text-base md:text-lg font-bold text-white">
                    Formulir Input Asesmen Tahap Awal (Temu Responden Baru)
                  </h3>
                  <p className="text-xs text-sky-200">
                    Formulir input cepat saat petugas sedang bertemu responden langsung di lapangan.
                  </p>
                </div>
                <div className="hidden sm:flex items-center gap-2 text-xs text-emerald-400 font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span>Kamera & File Ready</span>
                </div>
              </div>

              {formSubmitted && (
                <div className="mb-5 p-4 rounded-xl bg-emerald-950/90 border border-emerald-500 text-emerald-200 text-xs flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <span className="font-bold">Data Asesmen Ditambahkan ke Aplikasi</span>
                    <p className="text-[11px] text-emerald-300">
                      Data responden telah ditambahkan ke daftar SIPANDU. Status penyimpanan cloud ditampilkan terpisah agar aplikasi tidak menyatakan sinkronisasi berhasil sebelum layanan cloud mengonfirmasi.
                    </p>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmitTahapAwal} className="space-y-4">
                {/* Timestamp note */}
                <div className="p-3 rounded-xl bg-black/60 border border-rose-500/25 text-xs text-neutral-300 flex items-center justify-between">
                  <span className="font-semibold text-sky-200">Timestamp:</span>
                  <span className="italic text-emerald-400 font-mono">
                    (Nilai akan ada otomatis ketika responden/user menekan tombol selesai)
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Nama Lengkap */}
                  <div>
                    <label className="block text-xs font-bold text-sky-200 mb-1">
                      Nama Lengkap: <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={namaLengkap}
                      onChange={(e) => setNamaLengkap(e.target.value)}
                      placeholder="Nama lengkap sesuai KTP"
                      className="w-full p-2.5 rounded-lg bg-black/60 border border-rose-500/30 text-white text-xs focus:outline-none focus:border-sky-400"
                      required
                    />
                  </div>

                  {/* NIK */}
                  <div>
                    <label className="block text-xs font-bold text-sky-200 mb-1">
                      NIK (16 Digit): <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      maxLength={16}
                      minLength={16}
                      inputMode="numeric"
                      pattern="[0-9]{16}"
                      value={nik}
                      onChange={(e) => setNik(e.target.value.replace(/\D/g, '').slice(0, 16))}
                      placeholder="1271xxxxxxxxxxxx"
                      className="w-full p-2.5 rounded-lg bg-black/60 border border-rose-500/30 text-white text-xs focus:outline-none focus:border-sky-400 font-mono"
                      required
                    />
                  </div>

                  {/* USIA */}
                  <div>
                    <label className="block text-xs font-bold text-sky-200 mb-1">
                      USIA (Tahun): <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={usia}
                      onChange={(e) => setUsia(e.target.value)}
                      placeholder="Contoh: 32"
                      className="w-full p-2.5 rounded-lg bg-black/60 border border-rose-500/30 text-white text-xs focus:outline-none focus:border-sky-400"
                      required
                    />
                  </div>

                  {/* JENIS KELAMIN */}
                  <div>
                    <label className="block text-xs font-bold text-sky-200 mb-1">
                      JENIS KELAMIN: <span className="text-rose-400">*</span>
                    </label>
                    <select
                      value={jenisKelamin}
                      onChange={(e) => setJenisKelamin(e.target.value as 'Laki-laki' | 'Perempuan' | '')}
                      required
                      className="w-full p-2.5 rounded-lg bg-black/60 border border-rose-500/30 text-white text-xs focus:outline-none focus:border-sky-400"
                    >
                      <option value="">Pilih jenis kelamin responden</option>
                      <option value="Laki-laki">Laki-laki (Hijau Lumut)</option>
                      <option value="Perempuan">Perempuan (Pink)</option>
                    </select>
                  </div>

                  {/* KOTA DOMISILI SAAT INI */}
                  <div>
                    <label className="block text-xs font-bold text-sky-200 mb-1">
                      KOTA DOMISILI SAAT INI: <span className="text-rose-400">*</span>
                    </label>
                    <select
                      value={kotaDomisili}
                      onChange={(e) => setKotaDomisili(e.target.value)}
                      required
                      className="w-full p-2.5 rounded-lg bg-black/60 border border-rose-500/30 text-white text-xs focus:outline-none focus:border-sky-400"
                    >
                      <option value="">Pilih kota/kabupaten responden</option>
                      <option value="Kota Medan">Kota Medan</option>
                      <option value="Kab. Deli Serdang">Kab. Deli Serdang</option>
                      <option value="Kota Binjai">Kota Binjai</option>
                      <option value="Kota Pematangsiantar">Kota Pematangsiantar</option>
                      <option value="Kab. Asahan">Kab. Asahan</option>
                      <option value="Kab. Karo">Kab. Karo</option>
                      <option value="Kab. Tapanuli Utara">Kab. Tapanuli Utara</option>
                      <option value="Kota Tanjungbalai">Kota Tanjungbalai</option>
                      <option value="Kab. Labuhanbatu">Kab. Labuhanbatu</option>
                      <option value="Kab. Simalungun">Kab. Simalungun</option>
                      <option value="Kota Tebing Tinggi">Kota Tebing Tinggi</option>
                      <option value="Kab. Toba">Kab. Toba</option>
                      <option value="Kab. Dairi">Kab. Dairi</option>
                      <option value="Kepulauan Nias">Kepulauan Nias</option>
                    </select>
                  </div>

                  {/* NO HP/WA */}
                  <div>
                    <label className="block text-xs font-bold text-sky-200 mb-1">
                      NO HP / WHATSAPP: <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="tel"
                      value={noHpWa}
                      onChange={(e) => setNoHpWa(e.target.value)}
                      placeholder="0812xxxxxxxx"
                      className="w-full p-2.5 rounded-lg bg-black/60 border border-rose-500/30 text-white text-xs focus:outline-none focus:border-sky-400 font-mono"
                      required
                    />
                  </div>
                </div>

                {/* Upload / Live Camera Photos */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  {/* FOTO DIRI */}
                  <div className="p-3.5 rounded-xl bg-black/60 border border-rose-500/30 space-y-2">
                    <label className="block text-xs font-bold text-sky-200">
                      FOTO DIRI:
                      <span className="block text-[10px] text-neutral-400 font-normal">
                        (Bisa live kamera atau pilih foto dari handphone: JPG, PNG, WEBP)
                      </span>
                    </label>

                    {fotoDiri && (
                      <div className="w-20 h-24 rounded-lg overflow-hidden border border-emerald-500/50 my-1 bg-black">
                        <img src={fotoDiri} alt="Foto Diri" className="w-full h-full object-cover" />
                      </div>
                    )}
                    {fotoDiriName && (
                      <p className="text-[10px] text-emerald-300 font-mono truncate">
                        File: {fotoDiriName}
                      </p>
                    )}

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openCameraFor('fotoDiri')}
                        className="flex-1 py-2 px-2.5 rounded-lg bg-rose-900/60 hover:bg-rose-800/80 border border-rose-500/40 text-[11px] font-semibold text-white flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Camera className="w-3.5 h-3.5 text-rose-300" />
                        <span>Kamera (Live)</span>
                      </button>

                      <label className="flex-1 py-2 px-2.5 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/40 text-[11px] font-semibold text-white flex items-center justify-center gap-1.5 cursor-pointer">
                        <Upload className="w-3.5 h-3.5 text-emerald-300" />
                        <span>Pilih File</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(e) => handleFileUpload(e, 'fotoDiri')}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  {/* FOTO KTP */}
                  <div className="p-3.5 rounded-xl bg-black/60 border border-rose-500/30 space-y-2">
                    <label className="block text-xs font-bold text-sky-200">
                      FOTO KTP:
                      <span className="block text-[10px] text-neutral-400 font-normal">
                        (Bisa live kamera atau pilih foto dari handphone: JPG, PNG, WEBP)
                      </span>
                    </label>

                    {fotoKtp && (
                      <div className="w-28 h-20 rounded-lg overflow-hidden border border-emerald-500/50 my-1 bg-black">
                        <img src={fotoKtp} alt="Foto KTP" className="w-full h-full object-cover" />
                      </div>
                    )}
                    {fotoKtpName && (
                      <p className="text-[10px] text-emerald-300 font-mono truncate">
                        File: {fotoKtpName}
                      </p>
                    )}

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openCameraFor('fotoKtp')}
                        className="flex-1 py-2 px-2.5 rounded-lg bg-rose-900/60 hover:bg-rose-800/80 border border-rose-500/40 text-[11px] font-semibold text-white flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Camera className="w-3.5 h-3.5 text-rose-300" />
                        <span>Kamera (Live)</span>
                      </button>

                      <label className="flex-1 py-2 px-2.5 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/40 text-[11px] font-semibold text-white flex items-center justify-center gap-1.5 cursor-pointer">
                        <Upload className="w-3.5 h-3.5 text-emerald-300" />
                        <span>Pilih File</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(e) => handleFileUpload(e, 'fotoKtp')}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                </div>

                {/* Jenis Bantuan Yang Di Harapkan */}
                <div>
                  <label className="block text-xs font-bold text-sky-200 mb-1">
                    Jenis Bantuan Yang Di Harapkan:
                  </label>
                  <textarea
                    rows={2}
                    value={jenisBantuan}
                    onChange={(e) => setJenisBantuan(e.target.value)}
                    placeholder="Contoh: Bantuan Nutrisi Daya Tahan Tubuh, Modal Usaha Atensi, Transportasi Kontrol ARV"
                    className="w-full p-2.5 rounded-lg bg-black/60 border border-rose-500/30 text-white text-xs focus:outline-none focus:border-sky-400"
                    required
                  />
                </div>

                {/* Info Integrasi Kemensos */}
                <div className="p-2.5 rounded-lg bg-emerald-950/50 border border-emerald-500/30 flex items-center gap-2 text-[11px] text-emerald-200">
                  <CloudCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    Ini adalah formulir asli SIPANDU untuk Asesmen Tahap Awal. Setelah tersimpan ke database tahap awal, petugas dapat mengirim tautan Google Form utama yang terisi sebagian dari data responden.
                  </span>
                </div>

                {/* Tombol Kirim */}
                <div className="pt-2 text-center">
                  <button
                    type="submit"
                    className="w-full md:w-80 py-3.5 px-6 rounded-xl font-bold text-sm tracking-wider uppercase text-white bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-800 hover:from-emerald-700 hover:to-teal-700 active:scale-[0.99] transition border border-rose-500/60 shadow-[0_0_20px_rgba(244,63,94,0.3)] flex items-center justify-center gap-2 mx-auto cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                    <span>Kirim Formulir Asesmen</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 2. KONTEN: GOOGLE FORM UTAMA (tautan personal saja) */}
        {activeSubMenu === 'google-form' && (
          <div className="p-5 md:p-7 rounded-2xl bg-black/50 border border-rose-500/40 space-y-5">
            <div className="flex flex-col items-center text-center">
              <div className="p-3 rounded-full bg-emerald-950/80 border border-emerald-500/40">
                <Link className="w-8 h-8 text-sky-300" />
              </div>
              <h3 className="mt-3 text-lg md:text-xl font-black text-white uppercase tracking-wider">
                GOOGLE FORM UTAMA
              </h3>
            </div>

            <div className="mx-auto w-full max-w-2xl rounded-xl border border-sky-400/25 bg-black/35 p-3 sm:p-4">
              <label htmlFor="sipandu-google-form-url" className="mb-2 block text-xs font-bold text-sky-200">
                URL Google Form
              </label>
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                <input
                  id="sipandu-google-form-url"
                  type="url"
                  readOnly
                  value={GOOGLE_SIPANDU_RESOURCES.formRespondentUrl}
                  aria-label="URL Google Form Utama"
                  className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/50 px-3 py-2.5 text-xs leading-relaxed text-white select-all outline-none focus:border-sky-300"
                />
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCopyLink(GOOGLE_SIPANDU_RESOURCES.formRespondentUrl, 'Google Form Utama')}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-900/80 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-800 sm:flex-none"
                  >
                    <Copy className="h-4 w-4" />
                    <span>Salin URL</span>
                  </button>
                  <a
                    href={GOOGLE_SIPANDU_RESOURCES.formRespondentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-sky-400/40 bg-sky-950/80 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-sky-900 sm:flex-none"
                    aria-label="Buka Google Form Utama di tab baru"
                  >
                    <ExternalLink className="h-4 w-4" />
                    <span>Buka Form</span>
                  </a>
                </div>
              </div>
              {copyFeedback && (
                <p role="status" className="mt-2 text-[11px] font-semibold text-emerald-300">
                  ✓ {copyFeedback} berhasil disalin ke clipboard.
                </p>
              )}
              {copyError && (
                <p role="alert" className="mt-2 text-[11px] font-semibold text-rose-200">
                  {copyError}
                </p>
              )}
            </div>

            <div className="flex justify-center">
              <SipanduQRCode
                value={GOOGLE_SIPANDU_RESOURCES.formRespondentUrl}
                size={240}
                label="Barcode Google Form Utama"
                downloadFileName="barcode-google-form-utama-kemensos.png"
              />
            </div>
          </div>
        )}
      </div>

      {/* 4. DATABASE PPKS ASESMEN TAHAP AWAL (di paling bawah):
          Bingkai dengan judul DATABASE PPKS ASESMEN TAHAP AWAL.
          Nama kolom di tengah (center) dan sesuai isi.
          Tabel horizontal:
          Timestamp -> Nama Lengkap -> NIK -> USIA -> JENIS KELAMIN -> KOTA DOMISILI SAAT INI -> FOTO DIRI -> FOTO KTP -> AKSI
          Kolom aksi berisi tombol whatsapp untuk dikirim ke responden melengkapi asesmen lanjutan. */}
      <div className="p-5 md:p-6 rounded-2xl bg-black/45 border border-rose-500/40 shadow-[0_0_24px_rgba(244,63,94,0.18)]">
        <div className="text-center mb-5 pb-3 border-b border-rose-500/25">
          <h3 className="text-lg md:text-xl font-black text-white tracking-widest uppercase inline-block px-5 py-1 rounded-xl bg-emerald-950/80 border border-emerald-500/40 shadow-sm">
            DATABASE PPKS ASESMEN TAHAP AWAL
          </h3>
          <p className="text-xs text-sky-200 mt-1">
            Hanya responden yang mengirim formulir melalui link/barcode Asesmen Tahap Awal. Data dari spreadsheet Google Form utama tidak ditampilkan di daftar ini.
          </p>
          <p role="status" className={`mt-2 text-[10px] leading-relaxed ${stageOneSyncMessage.includes('belum dapat') || stageOneSyncMessage.includes('belum diatur') ? 'text-amber-200' : 'text-neutral-400'}`}>
            {stageOneSyncMessage}
          </p>
        </div>

        {/* Tabel Horizontal dengan Header Center */}
        <div className="overflow-x-auto rounded-xl border border-rose-500/35 bg-black/40">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-[#112415] border-b border-rose-500/30 text-sky-200 uppercase font-bold text-[11px] tracking-wider">
                <th className="py-3 px-3 text-center">Timestamp</th>
                <th className="py-3 px-3 text-center">Nama Lengkap</th>
                <th className="py-3 px-3 text-center">NIK</th>
                <th className="py-3 px-2 text-center">USIA</th>
                <th className="py-3 px-3 text-center">JENIS KELAMIN</th>
                <th className="py-3 px-3 text-center">KOTA DOMISILI SAAT INI</th>
                <th className="py-3 px-2 text-center">FOTO DIRI</th>
                <th className="py-3 px-2 text-center">FOTO KTP</th>
                <th className="py-3 px-3 text-center">AKSI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rose-500/20">
              {stageOneRespondents.map((ppks) => (
                <tr
                  key={ppks.id}
                  className="hover:bg-emerald-950/30 transition text-center items-center"
                >
                  <td className="py-3 px-3 font-mono text-emerald-300 text-[11px] whitespace-nowrap">
                    {ppks.timestamp}
                  </td>
                  <td className="py-3 px-3 font-bold text-white text-left">
                    {ppks.namaLengkap}
                  </td>
                  <td className="py-3 px-3 font-mono text-sky-200 whitespace-nowrap">
                    {ppks.nik}
                  </td>
                  <td className="py-3 px-2 font-semibold text-white">
                    {ppks.usia} Thn
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        ppks.jenisKelamin === 'Laki-laki'
                          ? 'bg-emerald-900 text-emerald-200 border border-emerald-400'
                          : 'bg-pink-950 text-pink-200 border border-pink-400'
                      }`}
                    >
                      {ppks.jenisKelamin}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-neutral-200">
                    {ppks.kotaDomisili}
                  </td>
                  <td className="py-3 px-2">
                    {ppks.fotoDiri ? (
                      <PrivateDriveImage
                        source={ppks.fotoDiri}
                        alt={`Foto diri ${ppks.namaLengkap}`}
                        className="mx-auto h-10 w-10 rounded-lg"
                        objectFit="cover"
                      />
                    ) : (
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-black/30 text-[8px] text-neutral-500">Tidak ada</span>
                    )}
                  </td>
                  <td className="py-3 px-2">
                    {ppks.fotoKtp ? (
                      <PrivateDriveImage
                        source={ppks.fotoKtp}
                        alt={`Foto KTP ${ppks.namaLengkap}`}
                        className="mx-auto h-8 w-12 rounded"
                        objectFit="contain"
                      />
                    ) : (
                      <span className="inline-flex h-8 w-12 items-center justify-center rounded border border-white/10 bg-black/30 text-[8px] text-neutral-500">Tidak ada</span>
                    )}
                  </td>
                  <td className="py-3 px-3 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSendWA(ppks)}
                      className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 active:scale-95 transition border border-rose-500/40 shadow-sm cursor-pointer"
                      title="Kirim Google Form utama yang sudah dipraisi sebagian ke responden"
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-white" />
                      <span>WhatsApp</span>
                    </button>
                  </td>
                </tr>
              ))}
              {stageOneRespondents.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-xs leading-relaxed text-neutral-400">
                    Belum ada kiriman Asesmen Tahap Awal. Data baru dari formulir publik SIPANDU akan muncul di sini setelah Firestore menerima pengiriman dan petugas berwenang tersambung.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live Camera Modal */}
      <CameraCaptureModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={handleCameraCapture}
        title={cameraTarget === 'fotoDiri' ? 'Foto Diri Responden' : 'Foto KTP Responden'}
      />
    </div>
  );
};
