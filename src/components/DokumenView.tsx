import React, { useMemo, useState } from 'react';
import { PPKSRecord } from '../types';
import { FolderArchive, FileText, Printer, Search, ClipboardCheck, Clock3 } from 'lucide-react';

interface DokumenViewProps {
  ppksList: PPKSRecord[];
  onOpenAssessment: (ppksId: string) => void;
}

/** Identity-only fields are prefilled from the master PPKS roster and do not mean an assessment was completed. */
const IDENTITY_ONLY_ANSWERS = new Set(['q5', 'q15', 'q16', 'q19', 'q23', 'q25']);

function hasCompletedIntegratedAnswers(record: PPKSRecord): boolean {
  const answers = record.formAsesmenTerintegrasi;
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return false;
  return Object.entries(answers).some(([key, value]) => {
    if (IDENTITY_ONLY_ANSWERS.has(key.toLowerCase())) return false;
    if (Array.isArray(value)) return value.some((item) => String(item ?? '').trim() !== '');
    return String(value ?? '').trim() !== '';
  });
}

function assessmentDate(record: PPKSRecord): string {
  if (!record.timestamp) return 'Tanggal tidak tersedia';
  const parsed = new Date(record.timestamp);
  return Number.isNaN(parsed.getTime()) ? record.timestamp : parsed.toLocaleString('id-ID');
}

export const DokumenView: React.FC<DokumenViewProps> = ({ ppksList, onOpenAssessment }) => {
  const [search, setSearch] = useState('');

  const archiveRecords = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('id-ID');
    return ppksList
      .filter(hasCompletedIntegratedAnswers)
      .filter((record) => !normalizedSearch || [
        record.namaLengkap,
        record.nik,
        record.id,
        record.kotaDomisili,
      ].some((value) => String(value || '').toLocaleLowerCase('id-ID').includes(normalizedSearch)))
      .sort((a, b) => {
        const dateA = Date.parse(a.timestamp || '') || 0;
        const dateB = Date.parse(b.timestamp || '') || 0;
        return dateB - dateA;
      });
  }, [ppksList, search]);

  return (
    <div className="workspace-page min-h-full space-y-4 text-white">
      <section className="rounded-2xl border border-white/10 bg-black/25 p-3 shadow-[0_12px_36px_rgba(0,0,0,0.18)] sm:p-5">
        <div className="mb-4 flex flex-col gap-3 border-b border-emerald-400/20 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-2.5 text-emerald-200">
              <FolderArchive className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">SIPANDU ODHIV</p>
              <h2 className="mt-0.5 text-lg font-extrabold tracking-wide text-white sm:text-xl">ARSIP DOKUMEN ASESMEN</h2>
              <p className="mt-1 text-xs text-neutral-400">Dokumen From Asesmen Terintegrasi yang sudah disimpan atau disiapkan untuk dicetak.</p>
            </div>
          </div>
          <div className="rounded-xl border border-emerald-300/20 bg-emerald-950/25 px-3 py-2 text-center">
            <p className="text-xl font-black tabular-nums text-emerald-200">{archiveRecords.length}</p>
            <p className="text-[9px] font-semibold uppercase tracking-wider text-neutral-400">Arsip ditemukan</p>
          </div>
        </div>

        <label className="mb-4 flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 focus-within:border-emerald-300/40">
          <Search className="h-4 w-4 shrink-0 text-neutral-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari nama responden, NIK, kota, atau ID PPKS…"
            aria-label="Cari arsip asesmen terintegrasi"
            className="w-full min-w-0 bg-transparent text-xs text-white outline-none placeholder:text-neutral-500"
          />
        </label>

        {archiveRecords.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-10 text-center">
            <FileText className="mx-auto mb-3 h-8 w-8 text-neutral-500" />
            <h3 className="text-sm font-bold text-neutral-200">{search ? 'Arsip tidak ditemukan' : 'Belum ada dokumen asesmen tersimpan'}</h3>
            <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-neutral-400">
              {search
                ? 'Periksa kembali kata pencarian Anda.'
                : 'Setelah From Asesmen Terintegrasi diisi dan disimpan, dokumennya akan muncul otomatis di sini. Form yang dicetak juga akan disimpan terlebih dahulu agar masuk ke arsip.'}
            </p>
            {!search && (
              <button
                type="button"
                onClick={() => onOpenAssessment(ppksList[0]?.id || '')}
                disabled={ppksList.length === 0}
                className="mt-4 inline-flex items-center gap-2 rounded-xl border border-emerald-300/30 bg-emerald-800/70 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ClipboardCheck className="h-4 w-4" /> Buka From Asesmen Terintegrasi
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {archiveRecords.map((record) => {
              const answerCount = Object.entries(record.formAsesmenTerintegrasi || {}).filter(([key, value]) => {
                if (IDENTITY_ONLY_ANSWERS.has(key.toLowerCase())) return false;
                return Array.isArray(value)
                  ? value.some((item) => String(item ?? '').trim() !== '')
                  : String(value ?? '').trim() !== '';
              }).length;

              return (
                <article key={record.id} className="rounded-2xl border border-emerald-300/15 bg-[#102016]/80 p-3.5 sm:p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-xl border border-sky-300/20 bg-sky-950/40 p-2 text-sky-200">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="break-words text-sm font-bold text-white">Form Asesmen Terintegrasi</h3>
                      <p className="mt-1 break-words text-xs font-semibold text-emerald-100">{record.namaLengkap || 'Nama responden tidak tersedia'}</p>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-neutral-400">
                        <span>ID PPKS: {record.id}</span>
                        {record.nik && <span>NIK: {record.nik}</span>}
                        {record.kotaDomisili && <span>{record.kotaDomisili}</span>}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-neutral-400">
                        <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" /> Data responden: {assessmentDate(record)}</span>
                        <span>{answerCount} bagian/jawaban terisi</span>
                      </div>
                      <p className="mt-2 inline-flex items-center gap-1 rounded-full border border-emerald-300/20 bg-emerald-950/35 px-2 py-1 text-[9px] font-semibold text-emerald-200">
                        <ClipboardCheck className="h-3 w-3" /> Tersimpan di database SIPANDU
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-col gap-2 border-t border-white/10 pt-3 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={() => onOpenAssessment(record.id)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-300/30 bg-sky-950/50 px-4 py-2.5 text-xs font-bold text-sky-100 transition hover:bg-sky-900/70"
                    >
                      <Printer className="h-4 w-4" /> Buka / Cetak PDF
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <p className="mt-5 border-t border-white/10 pt-3 text-[10px] leading-relaxed text-neutral-500">
          Arsip ini mengambil jawaban From Asesmen Terintegrasi yang sudah tersimpan pada database SIPANDU. Saat tombol Buka / Cetak PDF dipilih, aplikasi membuka responden yang sama; penyimpanan otomatis dilakukan sebelum dialog cetak agar hasilnya tercatat di arsip.
        </p>
      </section>
    </div>
  );
};
