import React, { useState } from 'react';
import { ProfileUser, SuratRecord } from '../types';
import { initialSuratList } from '../data/initialData';
import { KemensosLogo } from './KemensosLogo';
import {
  FolderArchive,
  FileText,
  FileCheck2,
  Printer,
  Plus,
  Upload,
  Calendar,
  MapPin,
  User,
  Shield,
  Download,
  Check,
} from 'lucide-react';

interface DokumenViewProps {
  profile: ProfileUser;
}

export const DokumenView: React.FC<DokumenViewProps> = ({ profile }) => {
  const [activeTab, setActiveTab] = useState<'surat-tugas' | 'surat-lainnya'>('surat-tugas');
  const [suratList, setSuratList] = useState<SuratRecord[]>(initialSuratList);
  const [selectedSurat, setSelectedSurat] = useState<SuratRecord | null>(initialSuratList[0] || null);
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);

  // New surat state
  const [newNomorSurat, setNewNomorSurat] = useState<string>(
    `ST.03.02/REHSOS-ODHIV/${new Date().getMonth() + 1}/${new Date().getFullYear()}`
  );
  const [newJudul, setNewJudul] = useState<string>('');
  const [newLokasi, setNewLokasi] = useState<string>('');
  const [newTanggal, setNewTanggal] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [newDeskripsi, setNewDeskripsi] = useState<string>('');

  const handleCreateSurat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newJudul.trim() || !newLokasi.trim() || !newDeskripsi.trim()) {
      alert('Isi judul, lokasi, dan uraian dokumen yang sebenarnya sebelum membuat dokumen.');
      return;
    }
    if (!profile.nama.trim() || !profile.nip.trim()) {
      alert('Lengkapi nama dan NIP petugas di Profil SIPANDU sebelum membuat dokumen resmi.');
      return;
    }

    const newRecord: SuratRecord = {
      id: `SRT-${Date.now()}`,
      nomorSurat: newNomorSurat,
      judul: newJudul,
      jenis: activeTab === 'surat-tugas' ? 'Surat Tugas' : 'Berita Acara',
      tanggal: newTanggal,
      petugas: profile.nama.trim(),
      nipPetugas: profile.nip.trim(),
      lokasi: newLokasi,
      status: 'Aktif',
      deskripsi: newDeskripsi.trim(),
    };

    setSuratList([newRecord, ...suratList]);
    setSelectedSurat(newRecord);
    setShowCreateModal(false);
    setNewJudul('');
    setNewDeskripsi('');
  };

  const handlePrintSurat = () => {
    window.print();
  };

  return (
    <div className="space-y-6 pb-28 text-white">
      {/* Bingkai Luar Menu DOKUMEN */}
      <div className="p-5 md:p-6 rounded-2xl bg-black/40 border border-rose-500/40 shadow-[0_0_24px_rgba(244,63,94,0.18)]">
        {/* Header Tab: Surat Tugas --->>> Surat Lainnya.. */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-4 mb-6 border-b border-rose-500/25">
          <div className="flex items-center gap-2">
            <FolderArchive className="w-6 h-6 text-sky-300" />
            <div>
              <h2 className="text-xl md:text-2xl font-black text-white tracking-wider uppercase">
                DOKUMEN
              </h2>
              <p className="text-xs text-sky-200">
                Arsip & Generator Dokumen Resmi Pendampingan Kemensos RI
              </p>
            </div>
          </div>

          {/* 2 Tab: Surat Tugas --->>> Surat Lainnya.. */}
          <div className="flex items-center gap-2 bg-black/60 p-1.5 rounded-xl border border-rose-500/35">
            <button
              type="button"
              onClick={() => setActiveTab('surat-tugas')}
              className={`py-2 px-4 rounded-lg font-bold text-xs uppercase tracking-wider transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'surat-tugas'
                  ? 'bg-emerald-800 text-white border border-rose-500/50 shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-sky-300" />
              <span>Surat Tugas</span>
            </button>

            <span className="text-rose-400 text-xs font-mono font-bold">{'--->>>'}</span>

            <button
              type="button"
              onClick={() => setActiveTab('surat-lainnya')}
              className={`py-2 px-4 rounded-lg font-bold text-xs uppercase tracking-wider transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'surat-lainnya'
                  ? 'bg-emerald-800 text-white border border-rose-500/50 shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <FileCheck2 className="w-3.5 h-3.5 text-sky-300" />
              <span>Surat Lainnya..</span>
            </button>
          </div>
        </div>

        {/* Action button bar */}
        <div className="flex items-center justify-between mb-6">
          <span className="text-xs text-neutral-300">
            {activeTab === 'surat-tugas'
              ? 'Daftar Surat Tugas Pendampingan Sosial ODHIV Kemensos:'
              : 'Daftar Berita Acara, Surat Pernyataan, & Rujukan Medis:'}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="py-2 px-3.5 rounded-xl bg-emerald-800/80 hover:bg-emerald-700 text-xs font-bold text-white border border-rose-500/40 shadow-sm flex items-center gap-1.5 cursor-pointer active:scale-95 transition"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-300" />
              <span>{activeTab === 'surat-tugas' ? 'Buat Surat Tugas Baru' : 'Buat Dokumen Baru'}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowUploadModal(true)}
              className="py-2 px-3.5 rounded-xl bg-sky-950/70 hover:bg-sky-900 text-xs font-bold text-sky-200 border border-sky-500/40 shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-sky-300" />
              <span>Upload Berkas</span>
            </button>
          </div>
        </div>

        {/* Main Content Grid: Surat List & Surat Preview */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* List of Surat */}
          <div className="lg:col-span-5 space-y-3">
            {suratList
              .filter((s) => (activeTab === 'surat-tugas' ? s.jenis === 'Surat Tugas' : s.jenis !== 'Surat Tugas'))
              .map((surat) => {
                const isSelected = selectedSurat?.id === surat.id;
                return (
                  <div
                    key={surat.id}
                    onClick={() => setSelectedSurat(surat)}
                    className={`p-4 rounded-xl border transition cursor-pointer ${
                      isSelected
                        ? 'bg-[#152e19] border-rose-500/60 shadow-[0_0_15px_rgba(244,63,94,0.25)]'
                        : 'bg-black/45 border-rose-500/25 hover:border-emerald-500/40 hover:bg-emerald-950/20'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/60 text-emerald-300 border border-emerald-500/30">
                        {surat.nomorSurat}
                      </span>
                      <span className="text-[10px] font-bold text-sky-300 bg-sky-950 px-2 py-0.5 rounded">
                        {surat.status}
                      </span>
                    </div>
                    <h4 className="text-xs font-bold text-white line-clamp-2 leading-snug">
                      {surat.judul}
                    </h4>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-sky-400" />
                        {surat.tanggal}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-rose-400" />
                        {surat.lokasi}
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>

          {/* Surat Preview Card (Official Kop Kementerian Sosial RI) */}
          <div className="lg:col-span-7">
            {selectedSurat ? (
              <div className="p-6 md:p-8 rounded-2xl bg-white text-neutral-900 border border-neutral-300 shadow-xl space-y-5">
                {/* Official Kop Surat Kemensos */}
                <div className="border-b-2 border-neutral-900 pb-3 text-center flex flex-col items-center">
                  <div className="flex items-center gap-3 mb-1">
                    <KemensosLogo size="mini" showText={false} />
                    <div className="text-left leading-tight">
                      <h3 className="font-extrabold text-sm md:text-base tracking-wider uppercase text-neutral-900">
                        KEMENTERIAN SOSIAL REPUBLIK INDONESIA
                      </h3>
                      <p className="text-[11px] font-semibold text-neutral-700">
                        DIREKTORAT REHABILITASI SOSIAL KORBAN PENYALAHGUNAAN NARKOBA & ODHIV
                      </p>
                    </div>
                  </div>
                  <p className="text-[9px] text-neutral-500">
                    Jalan Cawang Kencana No. 1, Jakarta Timur 13630 • Telp: (021) 3103591 • www.kemensos.go.id
                  </p>
                </div>

                {/* Surat Title & Number */}
                <div className="text-center space-y-1">
                  <h4 className="font-bold text-sm uppercase underline tracking-wider">
                    {selectedSurat.jenis.toUpperCase()}
                  </h4>
                  <p className="font-mono text-xs text-neutral-600">
                    Nomor: {selectedSurat.nomorSurat}
                  </p>
                </div>

                {/* Body Content */}
                <div className="space-y-3 text-xs leading-relaxed text-neutral-800">
                  <p>
                    Yang bertanda tangan di bawah ini Direktur Rehabilitasi Sosial Korban Penyalahgunaan Narkoba & ODHIV Kementerian Sosial RI, menugaskan kepada:
                  </p>

                  <div className="bg-neutral-100 p-3 rounded border border-neutral-200 grid grid-cols-3 gap-1 font-sans text-xs">
                    <span className="font-semibold">Nama:</span>
                    <span className="col-span-2 font-bold">{selectedSurat.petugas}</span>
                    <span className="font-semibold">NIP:</span>
                    <span className="col-span-2 font-mono">{selectedSurat.nipPetugas}</span>
                    <span className="font-semibold">Jabatan:</span>
                    <span className="col-span-2">Pendamping Sosial ODHIV Prov. Sumatera Utara</span>
                    <span className="font-semibold">Wilayah Tugas:</span>
                    <span className="col-span-2 text-emerald-800 font-semibold">{selectedSurat.lokasi}</span>
                  </div>

                  <p>
                    <strong>Untuk:</strong> {selectedSurat.deskripsi}
                  </p>
                  <p>
                    Demikian surat ini dibuat agar dapat dilaksanakan dengan penuh tanggung jawab dan melaporkan hasilnya kepada Direktur Rehabilitasi Sosial.
                  </p>
                </div>

                {/* Signature */}
                <div className="pt-4 flex justify-between items-end text-xs">
                  <div className="text-[10px] text-neutral-500">
                    <p>Dikeluarkan di: Medan</p>
                    <p>Pada tanggal: {selectedSurat.tanggal}</p>
                  </div>
                  <div className="text-center">
                    <p className="font-semibold">a.n. Direktur Jenderal Rehabilitasi Sosial</p>
                    <p className="text-[11px] text-neutral-600">Kasubdit ODHIV Kemensos RI</p>
                    <div className="h-16 flex items-center justify-center font-bold text-neutral-800 italic">
                      [Tanda Tangan & Cap Resmi]
                    </div>
                    <p className="font-bold underline">Drs. Supriyanto, M.Si</p>
                    <p className="font-mono text-[10px] text-neutral-600">NIP. 19680712 199303 1 001</p>
                  </div>
                </div>

                {/* Print Button */}
                <div className="pt-4 border-t border-neutral-200 flex justify-end gap-2 no-print">
                  <button
                    type="button"
                    onClick={handlePrintSurat}
                    className="py-2 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-md cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Cetak Surat Resmi</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-12 rounded-2xl bg-black/40 border border-dashed border-rose-500/30 text-center text-neutral-400">
                Pilih surat di sebelah kiri untuk melihat isi dan pratinjau cetak.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal: Buat Surat Baru */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="w-full max-w-lg bg-[#0e1c10] border border-rose-500/40 rounded-2xl p-6 shadow-2xl text-white">
            <h3 className="text-base font-bold text-white mb-4 pb-2 border-b border-rose-500/30">
              Buat {activeTab === 'surat-tugas' ? 'Surat Tugas Baru' : 'Dokumen / Berita Acara Baru'}
            </h3>
            <form onSubmit={handleCreateSurat} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-sky-200 font-semibold mb-1">Nomor Surat:</label>
                <input
                  type="text"
                  value={newNomorSurat}
                  onChange={(e) => setNewNomorSurat(e.target.value)}
                  className="w-full p-2.5 rounded bg-black/60 border border-rose-500/30 font-mono text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-sky-200 font-semibold mb-1">Judul Surat / Perihal:</label>
                <input
                  type="text"
                  value={newJudul}
                  onChange={(e) => setNewJudul(e.target.value)}
                  placeholder="Contoh: Pendampingan Responden ODHIV Wilayah Siantar & Simalungun"
                  className="w-full p-2.5 rounded bg-black/60 border border-rose-500/30 text-white"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sky-200 font-semibold mb-1">Wilayah / Lokasi Tugas:</label>
                  <input
                    type="text"
                    value={newLokasi}
                    onChange={(e) => setNewLokasi(e.target.value)}
                    className="w-full p-2.5 rounded bg-black/60 border border-rose-500/30 text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sky-200 font-semibold mb-1">Tanggal Surat:</label>
                  <input
                    type="date"
                    value={newTanggal}
                    onChange={(e) => setNewTanggal(e.target.value)}
                    className="w-full p-2.5 rounded bg-black/60 border border-rose-500/30 text-white"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sky-200 font-semibold mb-1">Instruksi & Uraian Tugas:</label>
                <textarea
                  rows={3}
                  value={newDeskripsi}
                  onChange={(e) => setNewDeskripsi(e.target.value)}
                  placeholder="Uraikan rincian penugasan lapangan..."
                  className="w-full p-2.5 rounded bg-black/60 border border-rose-500/30 text-white"
                  required
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg bg-black/60 hover:bg-black/80 text-neutral-300 text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold uppercase tracking-wider"
                >
                  Simpan & Terbitkan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Upload Berkas Eksternal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="w-full max-w-md bg-[#0e1c10] border border-rose-500/40 rounded-2xl p-6 shadow-2xl text-white text-center space-y-4">
            <div className="p-3 rounded-full bg-sky-950/80 border border-sky-500/30 text-sky-300 mx-auto w-12 h-12 flex items-center justify-center">
              <Upload className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white">Upload Dokumen Eksternal</h3>
            <p className="text-xs text-neutral-300">
              Unggah file PDF resmi formulir asesmen atau surat tugas (PDF, DOCX, scan JPEG).
            </p>

            <label className="block p-6 rounded-xl border-2 border-dashed border-rose-500/40 hover:border-sky-400 bg-black/50 cursor-pointer">
              <FileText className="w-8 h-8 text-neutral-400 mx-auto mb-2" />
              <span className="text-xs text-sky-300 font-semibold block">
                Klik atau seret file PDF / Dokumen ke sini
              </span>
              <span className="text-[10px] text-neutral-500">Maks. 25 MB</span>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.jpg,.png"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    alert(`Berkas "${f.name}" berhasil diunggah ke arsip dokumen SIPANDU ODHIV!`);
                    setShowUploadModal(false);
                  }
                }}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={() => setShowUploadModal(false)}
              className="w-full py-2 rounded-lg bg-neutral-800 text-neutral-300 text-xs font-semibold"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
