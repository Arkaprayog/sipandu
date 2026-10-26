import React, { useState, useEffect, useMemo } from 'react';
import { PPKSRecord, AppSettings } from '../types';
import { PrivateDriveImage } from './PrivateDriveImage';
import { deduplicatePPKSRecords, formatPPKSTimestamp, sortPPKSRecordsByName } from '../lib/ppksData';
import {
  buildWhatsAppMessage,
  createWhatsAppLink,
  getDesilDescription,
} from '../utils/helpers';
import {
  Search,
  MessageCircle,
  Save,
  Check,
  UserCheck,
  Calendar,
  Phone,
  MapPin,
  HeartPulse,
  Gift,
  HelpCircle,
  Clock,
  Sparkles,
} from 'lucide-react';

interface DatabasePpksViewProps {
  ppksList: PPKSRecord[];
  onUpdatePPKS: (updated: PPKSRecord) => void;
  settings: AppSettings;
}

function normalizeProfileNIK(value: unknown): string {
  const raw = String(value ?? '').trim().replace(/^['"`]/, '');
  if (!raw || /^[+-]?\d+(?:[.,]\d+)?e[+-]?\d+$/i.test(raw)) return '';
  const digits = raw.replace(/\D/g, '');
  if (/^\d{16}$/.test(digits)) return digits;
  // Older cached responses may have the question label stored with the answer.
  // Accept only one exact 16-digit run; never fill missing digits.
  const matches = [...raw.matchAll(/\d{16}/g)].map((match) => match[0]);
  return matches.length === 1 ? matches[0] : '';
}

function resolveProfileNIK(record: PPKSRecord): string {
  return normalizeProfileNIK(record.nik) || normalizeProfileNIK(record.officialAssessment?.q23);
}
export const DatabasePpksView: React.FC<DatabasePpksViewProps> = ({
  ppksList,
  onUpdatePPKS,
  settings,
}) => {
  const [selectedPPKSId, setSelectedPPKSId] = useState<string>('');
  const [editingDesil, setEditingDesil] = useState<number>(0);
  const [editingIntervensi, setEditingIntervensi] = useState<string>('');
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [showWaPreview, setShowWaPreview] = useState<boolean>(false);

  // Keep the database chooser in the same alphabetical order as the source roster.
  const displayPPKSList = useMemo(
    () => sortPPKSRecordsByName(deduplicatePPKSRecords(ppksList)),
    [ppksList]
  );

  // Currently selected PPKS
  const currentPPKS = displayPPKSList.find((p) => p.id === selectedPPKSId);
  const currentNIK = currentPPKS ? resolveProfileNIK(currentPPKS) : '';

  // Sync internal edit state when a PPKS is selected
  const handleSelectPPKS = (id: string) => {
    setSelectedPPKSId(id);
    setSaveSuccess(false);
    const target = displayPPKSList.find((p) => p.id === id);
    if (target) {
      setEditingDesil(target.desil);
      setEditingIntervensi(target.intervensiMental);
    }
  };

  // Auto-select the first respondent after a live spreadsheet import populates an empty view.
  useEffect(() => {
    if (displayPPKSList.length === 0) {
      setSelectedPPKSId('');
      return;
    }
    if (!displayPPKSList.some((record) => record.id === selectedPPKSId)) {
      handleSelectPPKS(displayPPKSList[0].id);
    }
  }, [displayPPKSList, selectedPPKSId]);

  const handleSave = () => {
    if (!currentPPKS) return;
    const updated: PPKSRecord = {
      ...currentPPKS,
      desil: editingDesil,
      intervensiMental: editingIntervensi,
    };
    onUpdatePPKS(updated);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const currentWaMessage = currentPPKS
    ? buildWhatsAppMessage(currentPPKS, {
        senderName: settings.senderName,
        senderRole: settings.senderRole,
        senderUnit: settings.senderUnit,
        googleFormTahapAwalUrl: settings.googleFormTahapAwalUrl,
        googleFormKesehatanMentalUrl: settings.googleFormKesehatanMentalUrl,
      })
    : '';

  const handleOpenWhatsApp = () => {
    if (!currentPPKS) return;
    const link = createWhatsAppLink(currentPPKS.noHpWa, currentWaMessage);
    window.open(link, '_blank');
  };

  return (
    <div className="space-y-6 pb-28 text-white">
      {/* Bingkai Luar: Judul DATABASE PPKS */}
      <div className="p-5 md:p-6 rounded-2xl bg-black/40 border border-rose-500/40 shadow-[0_0_22px_rgba(244,63,94,0.18)]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5 border-b border-rose-500/25 pb-4">
          <div>
            <h2 className="text-xl md:text-2xl font-black text-white tracking-wider flex items-center gap-2">
              <span>DATABASE PPKS</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/40 font-mono">
                ODHIV Sumatera Utara
              </span>
            </h2>
            <p className="text-xs text-sky-200 mt-1">
              Pusat data terintegrasi Penerima Pelayanan Kesejahteraan Sosial Kemensos RI
            </p>
          </div>
        </div>

        {/* Kotak Horizontal: Pemilihan Data PPKS yang akan dilihat */}
        <div className="mb-6">
          <label className="block text-xs font-bold text-sky-200 mb-2 uppercase tracking-wider flex items-center gap-2">
            <Search className="w-4 h-4 text-sky-300" />
            <span>Pilih Data PPKS Untuk Ditampilkan:</span>
          </label>
          <div className="relative">
            <select
              value={selectedPPKSId}
              onChange={(e) => handleSelectPPKS(e.target.value)}
              disabled={displayPPKSList.length === 0}
              className="w-full py-3.5 px-4 rounded-xl bg-[#142618] border border-rose-500/45 text-white font-medium text-sm focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400 shadow-md cursor-pointer transition disabled:opacity-60"
            >
              <option value="" className="bg-[#0f1d12] text-neutral-400">
                {displayPPKSList.length === 0 ? 'Belum ada data PPKS dimuat — gunakan Google Workspace & Cloud Hub' : '-- Silakan Klik Untuk Memilih Data PPKS --'}
              </option>
              {displayPPKSList.map((p) => (
                <option key={p.id} value={p.id} className="bg-[#0f1d12] text-white py-1">
                  {formatPPKSTimestamp(p.timestamp)} • {p.namaLengkap} • NIK: {resolveProfileNIK(p) || 'belum terpetakan'} • {p.kotaDomisili} (Desil {p.desil})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Halaman Kosong jika belum memilih */}
        {!currentPPKS && (
          <div className="p-12 rounded-2xl bg-black/25 border border-dashed border-rose-500/30 flex flex-col items-center justify-center text-center space-y-3">
            <div className="p-4 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-300">
              <UserCheck className="w-10 h-10 text-sky-300" />
            </div>
            <h4 className="text-base font-bold text-white">{displayPPKSList.length === 0 ? 'Data PPKS belum dimuat' : 'Database Belum Dipilih'}</h4>
            <p className="text-xs text-neutral-300 max-w-md">
              {displayPPKSList.length === 0
                ? 'Buka Google Workspace & Cloud Hub → Google Sheets, pilih spreadsheet sumber yang benar, lalu tekan “Muat Data PPKS + Asesmen”. Data yang berhasil diimpor akan muncul di sini.'
                : 'Silakan pilih responden PPKS untuk melihat profil lengkap, status desil, dan tindak lanjutnya.'}
            </p>
          </div>
        )}

        {/* Jika sudah memilih: Bingkai PROFIL PPKS */}
        {currentPPKS && (
          <div className="mt-4 p-5 md:p-6 rounded-2xl bg-black/50 border border-rose-500/45 shadow-[0_0_24px_rgba(244,63,94,0.18)]">
            {/* Judul PROFIL PPKS tepat di tengah tengah bingkai */}
            <div className="text-center mb-6 pb-3 border-b border-rose-500/25">
              <h3 className="text-lg md:text-xl font-black text-white tracking-widest uppercase inline-block px-4 py-1 rounded-lg bg-emerald-950/80 border border-emerald-500/40 shadow-sm">
                PROFIL PPKS
              </h3>
            </div>

            {/* Konten: Foto Diri di sebelah kiri, Tabel sejajar di sebelah kanan */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
              {/* Foto Diri PPKS di sebelah kiri */}
              <div className="md:col-span-4 flex flex-col items-center">
                <div className="relative w-48 h-56 md:w-56 md:h-64 rounded-2xl overflow-hidden border-2 border-rose-500/60 shadow-[0_0_20px_rgba(244,63,94,0.25)] bg-black/70">
                  <PrivateDriveImage
                    source={currentPPKS.fotoDiri}
                    alt={`Foto diri responden ${currentPPKS.namaLengkap}`}
                    className="h-full w-full rounded-none border-0"
                    objectFit="cover"
                  />
                  <div className="absolute top-2 right-2 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-900/90 text-white border border-emerald-400">
                    ID: {currentPPKS.id}
                  </div>
                </div>
                <div className="mt-2 text-center">
                  <span className="text-xs font-bold text-sky-200">Foto Diri Responden</span>
                  <p className="text-[10px] text-neutral-400">
                    Foto asli dari sumber data; tidak diganti dengan foto contoh
                  </p>
                </div>

                {/* Dokumen lain berada di kolom foto pada profil yang sama, bukan card di bawah Desil. */}
                <div className="mt-4 grid w-full grid-cols-2 gap-2">
                  {[
                    { label: 'Foto KTP', source: currentPPKS.fotoKtp },
                    { label: 'Foto KK', source: currentPPKS.fotoKk || '' },
                    { label: 'Foto Rumah Tampak Depan', source: currentPPKS.fotoRumah || '' },
                  ].map((photo) => (
                    <div key={photo.label} className="min-w-0 rounded-lg border border-white/10 bg-black/35 p-2">
                      <p className="mb-1.5 text-[10px] font-semibold text-sky-100">{photo.label}</p>
                      <PrivateDriveImage
                        source={photo.source}
                        alt={`${photo.label} — ${currentPPKS.namaLengkap}`}
                        className="h-24 w-full"
                        objectFit="contain"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Sebelah kanan foto: Tabel data vertikal sesuai urutan diminta */}
              <div className="md:col-span-8 overflow-hidden rounded-xl border border-rose-500/35 bg-black/40">
                <table className="w-full text-xs text-left border-collapse">
                  <tbody>
                    <tr className="border-b border-rose-500/20 hover:bg-emerald-950/20">
                      <td className="py-2.5 px-3 font-bold text-sky-200 w-1/3 bg-[#112415]">
                        Timestamp
                      </td>
                      <td className="py-2.5 px-3 font-mono text-emerald-300">
                        {formatPPKSTimestamp(currentPPKS.timestamp)}
                      </td>
                    </tr>

                    <tr className="border-b border-rose-500/20 hover:bg-emerald-950/20">
                      <td className="py-2.5 px-3 font-bold text-sky-200 bg-[#112415]">
                        Nama Lengkap
                      </td>
                      <td className="py-2.5 px-3 font-bold text-white text-sm">
                        {currentPPKS.namaLengkap}
                      </td>
                    </tr>

                    <tr className="border-b border-rose-500/20 hover:bg-emerald-950/20">
                      <td className="py-2.5 px-3 font-bold text-sky-200 bg-[#112415]">
                        NIK
                      </td>
                      <td className="py-2.5 px-3 font-mono text-sky-200 font-semibold tracking-wider break-all">
                        {currentNIK || 'NIK belum terpetakan dari spreadsheet sumber'}
                      </td>
                    </tr>

                    <tr className="border-b border-rose-500/20 hover:bg-emerald-950/20">
                      <td className="py-2.5 px-3 font-bold text-sky-200 bg-[#112415]">
                        Usia
                      </td>
                      <td className="py-2.5 px-3 text-white">
                        {currentPPKS.usia} Tahun ({currentPPKS.jenisKelamin})
                      </td>
                    </tr>

                    <tr className="border-b border-rose-500/20 hover:bg-emerald-950/20">
                      <td className="py-2.5 px-3 font-bold text-sky-200 bg-[#112415]">
                        Alamat Domisili Saat Ini
                      </td>
                      <td className="py-2.5 px-3 text-neutral-200 leading-snug">
                        {currentPPKS.alamatLengkap} ({currentPPKS.kotaDomisili})
                      </td>
                    </tr>

                    <tr className="border-b border-rose-500/20 hover:bg-emerald-950/20">
                      <td className="py-2.5 px-3 font-bold text-sky-200 bg-[#112415]">
                        NO HP/WA
                      </td>
                      <td className="py-2.5 px-3 font-mono text-emerald-400 font-bold">
                        {currentPPKS.noHpWa}
                      </td>
                    </tr>

                    <tr className="border-b border-rose-500/20 hover:bg-emerald-950/20">
                      <td className="py-2.5 px-3 font-bold text-sky-200 bg-[#112415]">
                        Jenis Bantuan yang Diharapkan
                      </td>
                      <td className="py-2.5 px-3 text-amber-200 font-medium">
                        {currentPPKS.jenisBantuan}
                      </td>
                    </tr>

                    <tr className="border-b border-rose-500/20 hover:bg-emerald-950/20">
                      <td className="py-2.5 px-3 font-bold text-sky-200 bg-[#112415]">
                        Intervensi & Rekomendasi Tindak Lanjut
                        <span className="block text-[10px] text-neutral-400 font-normal">
                          (Asesmen Kesehatan Mental ODHIV)
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <textarea
                          rows={2}
                          value={editingIntervensi}
                          onChange={(e) => setEditingIntervensi(e.target.value)}
                          className="w-full p-2 rounded bg-black/60 border border-rose-500/30 text-white text-xs focus:outline-none focus:border-sky-400"
                          placeholder="Ketik intervensi & rekomendasi tindak lanjut..."
                        />
                      </td>
                    </tr>

                    <tr className="hover:bg-emerald-950/20">
                      <td className="py-2.5 px-3 font-bold text-sky-200 bg-[#112415]">
                        Desil
                        <span className="block text-[10px] text-neutral-400 font-normal">
                          (Pilihan 0-10, diisi user/spreadsheet)
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                          <select
                            value={editingDesil}
                            onChange={(e) => setEditingDesil(Number(e.target.value))}
                            className="py-1.5 px-3 rounded-lg bg-black/60 border border-rose-500/40 text-sky-300 font-bold text-xs focus:outline-none focus:border-sky-400"
                          >
                            {Array.from({ length: 11 }, (_, i) => (
                              <option key={i} value={i}>
                                {i === 0 ? 'Desil 0 (Belum Terdata/Non-DTKS)' : `Desil ${i}`}
                              </option>
                            ))}
                          </select>
                          <span className="text-[11px] text-emerald-300 font-medium">
                            {getDesilDescription(editingDesil)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Dibawah kolom profil: Tombol WHATSAPP, lalu tombol SIMPAN */}
            <div className="mt-8 pt-5 border-t border-rose-500/30 flex flex-col items-center gap-3 max-w-lg mx-auto">
              {/* Tombol WhatsApp */}
              <div className="w-full flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenWhatsApp}
                  className="flex-1 py-3 px-4 rounded-xl font-bold text-sm tracking-wider uppercase text-white bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] transition border border-rose-500/50 shadow-[0_0_18px_rgba(16,185,129,0.35)] flex items-center justify-center gap-2 cursor-pointer"
                >
                  <MessageCircle className="w-5 h-5 text-white" />
                  <span>WhatsApp Responden</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowWaPreview(!showWaPreview)}
                  className="p-3 rounded-xl bg-black/60 hover:bg-black/80 border border-rose-500/35 text-sky-300 text-xs font-semibold"
                  title="Lihat Template Pesan WhatsApp"
                >
                  {showWaPreview ? 'Tutup Draft' : 'Draft Pesan'}
                </button>
              </div>

              {/* Preview draft WhatsApp text */}
              {showWaPreview && (
                <div className="w-full p-4 rounded-xl bg-black/80 border border-emerald-500/40 text-xs font-sans text-neutral-200 whitespace-pre-line leading-relaxed shadow-inner">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-emerald-800">
                    <span className="font-bold text-emerald-300">
                      Draft Pesan WhatsApp Resmi Kemensos:
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(currentWaMessage);
                        alert('Pesan berhasil disalin ke clipboard!');
                      }}
                      className="text-[10px] text-sky-300 underline"
                    >
                      Salin Teks
                    </button>
                  </div>
                  {currentWaMessage}
                </div>
              )}

              {/* Tombol Simpan di bawah tombol whatsapp */}
              <button
                type="button"
                onClick={handleSave}
                className="w-full py-2.5 px-4 rounded-xl font-bold text-xs tracking-wider uppercase text-white bg-gradient-to-r from-[#1b3d1f] to-[#122e15] hover:from-[#234f29] hover:to-[#1a401e] active:scale-[0.99] transition border border-rose-500/45 shadow-[0_0_12px_rgba(244,63,94,0.2)] flex items-center justify-center gap-2 cursor-pointer"
              >
                <Save className="w-4 h-4 text-sky-300" />
                <span>Simpan Perubahan Database</span>
              </button>

              {saveSuccess && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-300 bg-emerald-950/80 px-3 py-1 rounded border border-emerald-500/50 animate-bounce">
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Data profil PPKS & desil berhasil disimpan dan disinkronkan!</span>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
