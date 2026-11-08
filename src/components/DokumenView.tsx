import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PPKSRecord } from '../types';
import { FolderArchive, FileText, Printer, Search, ClipboardCheck, Clock3, UploadCloud, Download, RefreshCw, FileCheck2 } from 'lucide-react';
import { hasCompletedIntegratedAnswers } from '../lib/integratedAssessmentArchive';
import { ACCEPTED_DOCUMENT_EXTENSIONS, downloadStaffDocument, listStaffDocuments, retryStaffDocumentDriveBackup, uploadStaffDocument, type StaffDocumentRecord, type StaffDocumentCategory } from '../lib/documentStorage';

interface DokumenViewProps {
  ppksList: PPKSRecord[];
  onOpenAssessment: (ppksId: string) => void;
}

function assessmentDate(record: PPKSRecord): string {
  if (!record.timestamp) return 'Tanggal tidak tersedia';
  const parsed = new Date(record.timestamp);
  return Number.isNaN(parsed.getTime()) ? record.timestamp : parsed.toLocaleString('id-ID');
}

export const DokumenView: React.FC<DokumenViewProps> = ({ ppksList, onOpenAssessment }) => {
  const [search, setSearch] = useState('');
  const [staffDocuments, setStaffDocuments] = useState<StaffDocumentRecord[]>([]);
  const [documentSearch, setDocumentSearch] = useState('');
  const [documentCategory, setDocumentCategory] = useState<StaffDocumentCategory>('surat-tugas');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [documentBusy, setDocumentBusy] = useState(false);
  const [documentMessage, setDocumentMessage] = useState('');
  const [documentError, setDocumentError] = useState('');
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const refreshStaffDocuments = async () => {
    try { setStaffDocuments(await listStaffDocuments()); }
    catch (error) { setDocumentError(error instanceof Error ? error.message : 'Arsip dokumen gagal dimuat.'); }
  };
  useEffect(() => { void refreshStaffDocuments(); }, []);
  const visibleStaffDocuments = useMemo(() => {
    const term = documentSearch.trim().toLocaleLowerCase('id-ID');
    return staffDocuments.filter((record) => !term || [record.name, record.ownerEmail, record.category]
      .some((value) => String(value || '').toLocaleLowerCase('id-ID').includes(term)));
  }, [staffDocuments, documentSearch]);

  const handleDocumentUpload = async (file?: File) => {
    if (!file) return;
    setDocumentBusy(true); setDocumentError(''); setDocumentMessage(''); setUploadProgress(0);
    try {
      const saved = await uploadStaffDocument(file, documentCategory, setUploadProgress);
      setDocumentMessage(saved.driveBackupStatus === 'complete'
        ? 'Dokumen tersimpan di Firebase dan salinan Google Drive berhasil dibuat.'
        : 'Dokumen tersimpan di Firebase. Backup Google Drive belum berhasil; statusnya tercatat dan dapat dicoba ulang.');
      await refreshStaffDocuments();
    } catch (error) { setDocumentError(error instanceof Error ? error.message : 'Dokumen gagal diunggah.'); }
    finally { setDocumentBusy(false); setUploadProgress(null); if (uploadInputRef.current) uploadInputRef.current.value = ''; }
  };
  const handleDocumentDownload = async (record: StaffDocumentRecord) => {
    setDocumentBusy(true); setDocumentError('');
    try {
      const blob = await downloadStaffDocument(record.storagePath);
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a'); anchor.href = objectUrl; anchor.download = record.name; anchor.rel = 'noopener'; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) { setDocumentError(error instanceof Error ? error.message : 'Dokumen gagal diunduh.'); }
    finally { setDocumentBusy(false); }
  };
  const handleRetryDriveBackup = async (record: StaffDocumentRecord, file?: File) => {
    if (!file) return;
    setDocumentBusy(true); setDocumentError(''); setDocumentMessage('');
    try { await retryStaffDocumentDriveBackup(record.id, file); setDocumentMessage('Backup Google Drive berhasil diperbarui.'); await refreshStaffDocuments(); }
    catch (error) { setDocumentError(error instanceof Error ? error.message : 'Backup Google Drive gagal.'); }
    finally { setDocumentBusy(false); }
  };

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
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3"><div className="rounded-xl border border-sky-300/20 bg-sky-300/10 p-2.5 text-sky-200"><FileCheck2 className="h-6 w-6" /></div><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-300">DOCUMENT CENTER</p><h2 className="text-lg font-extrabold text-white">ARSIP DOKUMEN PETUGAS</h2><p className="text-xs text-neutral-400">Penyimpanan privat Firebase dengan status backup Google Drive.</p></div></div>
          <span className="rounded-xl border border-sky-300/20 bg-sky-950/30 px-3 py-2 text-center text-xs font-bold text-sky-100">{staffDocuments.length} dokumen</span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
          <label className="text-[10px] font-semibold text-neutral-300">Kategori dokumen<select value={documentCategory} onChange={(event) => setDocumentCategory(event.target.value as StaffDocumentCategory)} className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-[#142618] px-3 text-xs text-white"><option value="surat-tugas">Surat tugas</option><option value="surat-lainnya">Dokumen lainnya</option></select></label>
          <div className="flex items-end"><input ref={uploadInputRef} type="file" accept={ACCEPTED_DOCUMENT_EXTENSIONS} disabled={documentBusy} onChange={(event) => void handleDocumentUpload(event.target.files?.[0])} className="hidden" aria-label="Pilih dokumen untuk diunggah" /><button type="button" disabled={documentBusy} onClick={() => uploadInputRef.current?.click()} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-emerald-300/30 bg-emerald-800/70 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 sm:w-auto"><UploadCloud className="h-4 w-4" /> Unggah dokumen</button></div>
        </div>
        <p className="mt-2 text-[10px] text-neutral-500">PDF, DOC/DOCX, JPG/PNG, WEBP, TIFF, HEIC. Maksimal 25 MB per file.</p>
        {uploadProgress !== null && <div className="mt-3 rounded-xl border border-sky-300/20 bg-sky-950/30 p-3"><div className="mb-1 flex justify-between text-[10px] text-sky-100"><span>Mengunggah dokumen…</span><span>{uploadProgress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-black/40"><div className="h-full rounded-full bg-sky-400 transition-all" style={{ width: uploadProgress + '%' }} /></div></div>}
        {documentMessage && <p role="status" className="mt-3 rounded-lg border border-emerald-300/20 bg-emerald-950/30 p-3 text-xs text-emerald-100">{documentMessage}</p>}
        {documentError && <p role="alert" className="mt-3 rounded-lg border border-rose-300/20 bg-rose-950/30 p-3 text-xs text-rose-100">{documentError}</p>}
        <label className="mt-4 flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5"><Search className="h-4 w-4 text-neutral-400" /><input type="search" value={documentSearch} onChange={(event) => setDocumentSearch(event.target.value)} placeholder="Cari nama file, kategori, atau pengunggah…" className="w-full bg-transparent text-xs text-white outline-none placeholder:text-neutral-500" /></label>
        <div className="mt-3 space-y-2">
          {visibleStaffDocuments.length === 0 ? <p className="rounded-xl border border-dashed border-white/15 p-6 text-center text-xs text-neutral-400">{documentSearch ? 'Dokumen tidak ditemukan.' : 'Belum ada dokumen petugas dalam arsip.'}</p> : visibleStaffDocuments.map((record) => (
            <article key={record.id} className="rounded-xl border border-white/10 bg-[#102016]/70 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0 flex-1"><h3 className="break-words text-xs font-bold text-white">{record.name}</h3><p className="mt-1 text-[10px] text-neutral-400">{record.category === 'surat-tugas' ? 'Surat tugas' : 'Dokumen lainnya'} · {(record.size / (1024 * 1024)).toFixed(2)} MB · {record.uploadedAt ? new Date(record.uploadedAt).toLocaleString('id-ID') : 'Tanggal tidak tersedia'}</p><p className="mt-1 text-[10px] text-neutral-500">Pengunggah: {record.ownerEmail || 'Akun petugas'}</p></div><span className={'rounded-full border px-2 py-1 text-[9px] font-semibold ' + (record.driveBackupStatus === 'complete' ? 'border-emerald-300/20 bg-emerald-950/30 text-emerald-200' : 'border-amber-300/20 bg-amber-950/30 text-amber-100')}>{record.driveBackupStatus === 'complete' ? 'Drive tersinkron' : 'Backup perlu diperiksa'}</span></div>
              <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={documentBusy} onClick={() => void handleDocumentDownload(record)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-sky-300/20 bg-sky-950/40 px-3 py-2 text-[10px] font-bold text-sky-100 disabled:opacity-50"><Download className="h-3.5 w-3.5" /> Unduh aman</button>
              {record.driveBackupStatus !== 'complete' && <label className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-amber-300/20 bg-amber-950/30 px-3 py-2 text-[10px] font-bold text-amber-100"><RefreshCw className="h-3.5 w-3.5" /> Pilih file asli untuk ulangi backup<input type="file" accept={ACCEPTED_DOCUMENT_EXTENSIONS} disabled={documentBusy} className="hidden" onChange={(event) => void handleRetryDriveBackup(record, event.target.files?.[0])} /></label>}</div>
              {record.driveBackupError && record.driveBackupStatus !== 'complete' && <p className="mt-2 break-words text-[10px] text-amber-100/80">{record.driveBackupError}</p>}
            </article>
          ))}
        </div>
        <p className="mt-4 border-t border-white/10 pt-3 text-[10px] leading-relaxed text-neutral-500">Arsip ini memakai koleksi staffDocuments dan bucket Firebase yang sudah ada. Akses baca/unduh melewati Firebase Storage Rules; tidak membuat link publik, tidak mengubah file lama, dan tidak menghapus dokumen otomatis.</p>
      </section>

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
                if (['q5', 'q15', 'q16', 'q19', 'q23', 'q25'].includes(key.toLowerCase())) return false;
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
