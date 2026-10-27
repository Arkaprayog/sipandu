import React, { useState } from 'react';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { Download, FileText, RotateCcw } from 'lucide-react';

type Fields = {
  nomor: string; tanggal: string; kota: string; pegawai: string; jabatanPegawai: string;
  kegiatan: string; dasar: string; instruksi: string; penutup: string;
};

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
type TextLine = { text: string };

function wrapParagraph(text: string, font: Awaited<ReturnType<PDFDocument['embedFont']>>, size: number, maxWidth: number): TextLine[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: TextLine[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? line + ' ' + word : word;
    if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push({ text: line });
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push({ text: line });
  return lines;
}

export const SuratTugasEditor: React.FC = () => {
  const [f, setF] = useState<Fields>(defaults);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const update = (key: keyof Fields, value: string) => setF(old => ({ ...old, [key]: value }));
  const reset = () => { setF(defaults); setError(''); };

  const downloadPdf = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      // Edit the uploaded PDF itself, not a browser screenshot. This retains the
      // original vector artwork, letterhead, QR signature, signatory and footer.
      const appRoot = window.location.hostname === 'arkaprayog.github.io' ? '/sipandu/' : '/';
      const sourceUrl = new URL(appRoot + 'uploads/Surat%20Tugas.pdf', window.location.origin).href;
      const response = await fetch(sourceUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error('PDF sumber tidak dapat dimuat (HTTP ' + response.status + ').');
      const sourceBytes = await response.arrayBuffer();
      const pdf = await PDFDocument.load(sourceBytes);
      const page = pdf.getPages()[0];
      if (!page) throw new Error('Halaman PDF asli tidak ditemukan.');
      const { width: pageWidth, height: pageHeight } = page.getSize();
      const scaleX = pageWidth / 210;
      const scaleY = pageHeight / 297;
      const regular = await pdf.embedFont(StandardFonts.TimesRoman);
      const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
      const white = rgb(1, 1, 1);

      const drawEditable = (opts: {
        text: string; x: number; top: number; width: number; height: number;
        size?: number; bold?: boolean; center?: boolean; nowrap?: boolean;
      }) => {
        const { text, x, top, width, height } = opts;
        const size = opts.size ?? 11;
        const font = opts.bold ? bold : regular;
        const xPt = x * scaleX;
        const topPt = top * scaleY;
        const widthPt = width * scaleX;
        const heightPt = height * scaleY;
        // White out only the original editable text area. Everything else on the
        // official PDF page remains vector-identical to the source file.
        page.drawRectangle({
          x: xPt, y: pageHeight - topPt - heightPt, width: widthPt, height: heightPt,
          color: white, opacity: 1,
        });
        const padding = 0.4 * scaleX;
        const maxTextWidth = Math.max(1, widthPt - padding * 2);
        let lines: TextLine[];
        if (opts.nowrap) {
          lines = [{ text }];
        } else {
          lines = text.split(/\r?\n/).flatMap(paragraph => wrapParagraph(paragraph, font, size, maxTextWidth));
        }
        const lineHeight = size * 1.14;
        const maxLines = Math.max(1, Math.floor((heightPt - 1) / lineHeight));
        lines = lines.slice(0, maxLines);
        lines.forEach((line, index) => {
          const textWidth = font.widthOfTextAtSize(line.text, size);
          const drawX = opts.center ? xPt + (widthPt - textWidth) / 2 : xPt + padding;
          const drawY = pageHeight - topPt - size - 0.8 - index * lineHeight;
          page.drawText(line.text, { x: drawX, y: drawY, size, font, color: rgb(0.07, 0.07, 0.07), maxWidth: maxTextWidth });
        });
      };

      drawEditable({ text: 'NOMOR : ' + f.nomor, x: 65, top: 44.5, width: 80, height: 5.5, size: 11.5, bold: true, center: true, nowrap: true });
      drawEditable({ text: f.kegiatan, x: 46.5, top: 60.1, width: 146.3, height: 20.9, size: 10.8 });
      drawEditable({ text: f.dasar, x: 46.5, top: 85, width: 146.3, height: 10.2, size: 10.8 });
      drawEditable({ text: f.pegawai + ' / ' + f.jabatanPegawai, x: 46.5, top: 107.2, width: 146.3, height: 6, size: 10.8 });
      drawEditable({ text: f.instruksi, x: 46.5, top: 117, width: 146.3, height: 32.3, size: 10.6 });
      drawEditable({ text: f.penutup, x: 18.2, top: 153.5, width: 173.9, height: 10.2, size: 10.8 });
      drawEditable({ text: f.kota + ', ' + f.tanggal, x: 113.8, top: 187.7, width: 77, height: 6, size: 10.8, nowrap: true });

      const bytes = await pdf.save();
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeName = f.pegawai.split(/[\/,]/)[0].replace(/[^a-z0-9 -]/gi, '').trim().replace(/\s+/g, '-');
      link.href = objectUrl;
      link.download = 'Surat-Tugas-' + (safeName || 'SIPANDU') + '.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (e) {
      setError('PDF belum dibuat agar tidak menghasilkan dokumen yang salah. ' + (e instanceof Error ? e.message : 'Terjadi kesalahan saat memproses PDF.'));
    } finally {
      setBusy(false);
    }
  };

  const base = import.meta.env.BASE_URL;
  return <section className="mb-6 rounded-2xl border border-emerald-400/35 bg-emerald-950/35 p-4 md:p-5">
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h3 className="text-base font-extrabold text-white">Template Surat Tugas — Editor SIPANDU</h3>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-neutral-300">Edit isi surat di aplikasi, lalu unduh PDF satu halaman. PDF dibuat langsung dari file asli, sehingga kop surat, logo, barcode tanda tangan elektronik, tanda tangan pejabat, dan footer asli dipertahankan.</p>
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
      <button type="button" onClick={downloadPdf} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-emerald-300/40 bg-emerald-700 px-4 py-3 text-sm font-extrabold text-white hover:bg-emerald-600 disabled:cursor-wait disabled:opacity-60"><Download className="h-5 w-5" /> {busy ? 'Membuat PDF…' : 'Unduh PDF / Cetak'}</button>
      <a href={`${base}uploads/Surat%20Tugas.pdf`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-sm font-semibold text-sky-100 hover:bg-black/60"><FileText className="h-5 w-5" /> Lihat PDF Asli</a>
    </div>
    <p className="mt-3 text-[11px] leading-relaxed text-sky-100/80">PDF diunduh langsung dengan satu halaman asli. Buka file PDF yang diunduh untuk mencetak atau menyimpannya kembali dari perangkat Android.</p>
    {error && <p role="alert" className="mt-3 rounded-lg border border-red-400/40 bg-red-950/50 p-3 text-sm text-red-100">{error}</p>}
  </section>;
};
