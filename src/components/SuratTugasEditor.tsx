import React, { useState } from 'react';
import { Printer, FileText, RotateCcw } from 'lucide-react';

type Fields = {
  nomor: string; tanggal: string; kota: string; pegawai: string; jabatanPegawai: string;
  kegiatan: string; dasar: string; instruksi: string; penutup: string;
};

// Text defaults follow the uploaded official PDF. The original PDF page is used
// as the print artwork, so its letterhead, barcode, signer, typography and spacing
// remain untouched and only editable text regions are overlaid.
const defaults: Fields = {
  nomor: '985/4.21/RH.00.01/10/2026',
  tanggal: '20 Oktober 2026',
  kota: 'Jakarta',
  pegawai: '1. Deny Arifin Martyon Sikumbang',
  jabatanPegawai: 'Psikolog Klinis Ahli Pertama',
  kegiatan: 'a. Bahwa akan melaksanakan kegiatan koordinasi bersama Layanan PDP HIV terkait Program Atensi Klaster ODHIV di Kota Padang Sidempuan;\nb. sehubungan dengan poin a, dipandang perlu menugaskan pegawai Direktorat RSKPNO untuk melaksanakan kegiatan dimaksud.',
  dasar: 'Daftar Isian Pelaksanaan Anggaran Direktorat RSKPNO Nomor : SP DIPA - 027.04.2.690589/2026 tanggal 1 Desember 2025.',
  instruksi: '1. Melaksanakan kegiatan koordinasi bersama Layanan PDP HIV terkait Program Atensi Klaster ODHIV di Kota Padang Sidempuan\n2. pelaksanaan kegiatan pada tanggal 21 s.d 23 Oktober 2026;\n3. tidak menerima gratifikasi dalam bentuk apapun dan diwajibkan untuk tetap menjaga integritas selama pelaksanaan tugas;\n4. melaporkan hasil pelaksanaan kegiatan kepada atasan.',
  penutup: 'Demikian disampaikan untuk dilaksanakan dengan sebaik-baiknya dan penuh rasa tanggung jawab.',
};
const inputClass = 'mt-1 w-full rounded-lg border border-emerald-400/25 bg-black/35 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-300';
const labelClass = 'block text-xs font-semibold text-sky-100';

export const SuratTugasEditor: React.FC = () => {
  const [f, setF] = useState<Fields>(defaults);
  const update = (key: keyof Fields, value: string) => setF(old => ({ ...old, [key]: value }));
  const reset = () => setF(defaults);
  const base = import.meta.env.BASE_URL;
  const printableText = (value: string) => value.replace(/\r/g, '');
  return <section className="mb-6 rounded-2xl border border-emerald-400/35 bg-emerald-950/35 p-4 md:p-5">
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h3 className="text-base font-extrabold text-white">Template Surat Tugas — Editor SIPANDU</h3>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-neutral-300">Isi surat dapat diedit langsung di aplikasi. Hasil cetak memakai halaman PDF asli sebagai dasar, sehingga kop surat, barcode, jabatan dan nama pejabat tetap persis seperti sumber. Hasil disiapkan satu halaman A4.</p>
      </div>
      <button type="button" onClick={reset} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-neutral-200 hover:bg-white/10"><RotateCcw className="h-4 w-4" /> Pulihkan Template</button>
    </div>
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <label className={labelClass}>Nomor surat<input className={inputClass} value={f.nomor} onChange={e => update('nomor',e.target.value)} /></label>
      <label className={labelClass}>Tanggal surat<input className={inputClass} value={f.tanggal} onChange={e => update('tanggal',e.target.value)} /></label>
      <label className={labelClass}>Dikeluarkan di<input className={inputClass} value={f.kota} onChange={e => update('kota',e.target.value)} /></label>
      <label className={labelClass}>Nama pegawai yang ditugaskan<input className={inputClass} value={f.pegawai} onChange={e => update('pegawai',e.target.value)} /></label>
      <label className={labelClass}>Jabatan pegawai yang ditugaskan<input className={inputClass} value={f.jabatanPegawai} onChange={e => update('jabatanPegawai',e.target.value)} /></label>
      <label className={labelClass + ' md:col-span-2'}>Menimbang / kegiatan<textarea rows={4} className={inputClass} value={f.kegiatan} onChange={e => update('kegiatan',e.target.value)} /></label>
      <label className={labelClass + ' md:col-span-2'}>Dasar penugasan<textarea rows={2} className={inputClass} value={f.dasar} onChange={e => update('dasar',e.target.value)} /></label>
      <label className={labelClass + ' md:col-span-2'}>Instruksi tugas<textarea rows={5} className={inputClass} value={f.instruksi} onChange={e => update('instruksi',e.target.value)} /></label>
      <label className={labelClass + ' md:col-span-2'}>Kalimat penutup<textarea rows={2} className={inputClass} value={f.penutup} onChange={e => update('penutup',e.target.value)} /></label>
    </div>
    <div className="mt-5 flex flex-wrap items-center gap-3">
      <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl border border-emerald-300/40 bg-emerald-700 px-4 py-3 text-sm font-extrabold text-white hover:bg-emerald-600"><Printer className="h-5 w-5" /> Cetak / Unduh PDF</button>
      <a href={`${base}uploads/Surat%20Tugas.pdf`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-sm font-semibold text-sky-100 hover:bg-black/60"><FileText className="h-5 w-5" /> Lihat PDF Asli</a>
    </div>
    <p className="mt-3 text-[11px] leading-relaxed text-sky-100/80">Pada dialog cetak, pilih kertas A4, skala 100%, margin “Tidak ada”, dan nonaktifkan header/footer browser. Pada Android, pilih “Simpan sebagai PDF”.</p>

    <div className="surat-tugas-print-root" aria-hidden="true">
      <article className="surat-tugas-paper">
        <img className="surat-tugas-original-page" src={`${base}uploads/surat-tugas-original-background.png`} alt="" />
        <div className="surat-tugas-overlay surat-tugas-number-overlay">{printableText(f.nomor)}</div>
        <div className="surat-tugas-overlay surat-tugas-kegiatan-overlay">{printableText(f.kegiatan)}</div>
        <div className="surat-tugas-overlay surat-tugas-dasar-overlay">{printableText(f.dasar)}</div>
        <div className="surat-tugas-overlay surat-tugas-pegawai-overlay">{printableText(f.pegawai + ' / ' + f.jabatanPegawai)}</div>
        <div className="surat-tugas-overlay surat-tugas-instruksi-overlay">{printableText(f.instruksi)}</div>
        <div className="surat-tugas-overlay surat-tugas-penutup-overlay">{printableText(f.penutup)}</div>
        <div className="surat-tugas-overlay surat-tugas-date-overlay">{f.kota}, {f.tanggal}</div>
      </article>
    </div>
  </section>;
};
