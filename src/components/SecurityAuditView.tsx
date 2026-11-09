import React, { useMemo, useState } from 'react';
import { Activity, AlertTriangle, Download, FileClock, Search, ShieldCheck, Users } from 'lucide-react';
import type { SecurityAuditEntry } from '../types';

interface Props {
  entries: SecurityAuditEntry[];
  loading: boolean;
  error: string;
  currentUserRole: string;
}

type SourceFilter = 'semua' | 'service-event' | 'field-visit';

const csvCell = (value: unknown) => '"' + String(value ?? '').replace(/"/g, '""') + '"';
const formatDate = (value: string) => {
  if (!value) return 'Tidak tersedia';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
};
const sourceLabel = (source: SecurityAuditEntry['source']) =>
  source === 'service-event' ? 'Riwayat layanan' : 'Kunjungan lapangan';

export const SecurityAuditView: React.FC<Props> = ({ entries, loading, error, currentUserRole }) => {
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('semua');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const filteredEntries = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('id-ID');
    return entries.filter((entry) => {
      const textMatch = !needle || [
        entry.ppksId, entry.actorUid, entry.assignedToUid, entry.label, entry.status,
      ].some((value) => String(value || '').toLocaleLowerCase('id-ID').includes(needle));
      const sourceMatch = sourceFilter === 'semua' || entry.source === sourceFilter;
      const day = String(entry.createdAt || '').slice(0, 10);
      const fromMatch = !dateFrom || (day && day >= dateFrom);
      const toMatch = !dateTo || (day && day <= dateTo);
      return textMatch && sourceMatch && fromMatch && toMatch;
    });
  }, [entries, search, sourceFilter, dateFrom, dateTo]);

  const uniqueActors = new Set(filteredEntries.map((entry) => entry.actorUid).filter(Boolean)).size;
  const serviceCount = filteredEntries.filter((entry) => entry.source === 'service-event').length;
  const visitCount = filteredEntries.filter((entry) => entry.source === 'field-visit').length;

  const exportCsv = () => {
    const rows = [
      ['Jejak Audit Operasional SIPANDU', new Date().toISOString()],
      ['Cakupan', '250 event terbaru per koleksi: ppksServiceEvents dan fieldVisits'],
      ['Tanggal catatan', 'Sumber', 'ID PPKS', 'Aktivitas', 'Status/hasil', 'UID pelaku', 'UID penugasan', 'Waktu dicatat'],
      ...filteredEntries.map((entry) => [
        entry.eventDate, sourceLabel(entry.source), entry.ppksId, entry.label,
        entry.status, entry.actorUid, entry.assignedToUid, entry.createdAt,
      ]),
    ];
    const content = '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'SIPANDU-Jejak-Audit-' + new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }) + '.csv';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  if (!['owner', 'supervisor'].includes(currentUserRole)) {
    return <section role="alert" className="rounded-2xl border border-rose-300/20 bg-rose-950/30 p-5 text-sm text-rose-100">Menu ini hanya tersedia untuk owner dan supervisor.</section>;
  }

  return (
    <div className="workspace-page space-y-4 pb-28 text-white">
      <section className="rounded-3xl border border-emerald-200/15 bg-gradient-to-br from-[#102b21] via-[#111d1a] to-slate-950 p-4 shadow-xl sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200"><ShieldCheck className="h-4 w-4" /> SECURITY & AUDIT CENTER</span>
            <h2 className="mt-2 text-xl font-black sm:text-2xl">Pusat Keamanan & Audit</h2>
            <p className="mt-2 max-w-2xl text-xs leading-relaxed text-slate-300">Jejak perubahan layanan dan catatan pendampingan yang tersimpan sebagai event append-only. Akses halaman ini dibatasi untuk owner dan supervisor.</p>
          </div>
          <button type="button" onClick={exportCsv} disabled={!filteredEntries.length} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-emerald-200/20 bg-emerald-400/10 px-3 py-2 text-xs font-bold text-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"><Download className="h-4 w-4" /> Ekspor CSV</button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <article className="rounded-2xl border border-white/10 bg-white/[0.06] p-3"><Activity className="h-4 w-4 text-emerald-200" /><strong className="mt-2 block text-2xl font-black tabular-nums">{filteredEntries.length.toLocaleString('id-ID')}</strong><span className="text-[10px] text-slate-300">Event ditampilkan</span></article>
          <article className="rounded-2xl border border-white/10 bg-white/[0.06] p-3"><FileClock className="h-4 w-4 text-sky-200" /><strong className="mt-2 block text-2xl font-black tabular-nums">{serviceCount.toLocaleString('id-ID')}</strong><span className="text-[10px] text-slate-300">Perubahan layanan</span></article>
          <article className="rounded-2xl border border-white/10 bg-white/[0.06] p-3"><Users className="h-4 w-4 text-violet-200" /><strong className="mt-2 block text-2xl font-black tabular-nums">{visitCount.toLocaleString('id-ID')}</strong><span className="text-[10px] text-slate-300">Catatan kunjungan</span></article>
          <article className="rounded-2xl border border-white/10 bg-white/[0.06] p-3"><ShieldCheck className="h-4 w-4 text-amber-200" /><strong className="mt-2 block text-2xl font-black tabular-nums">{uniqueActors.toLocaleString('id-ID')}</strong><span className="text-[10px] text-slate-300">UID pelaku unik</span></article>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-black/20 p-3 sm:p-5">
        <div className="grid gap-2 sm:grid-cols-[1fr_180px_150px_150px]">
          <label className="flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3"><Search className="h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari ID PPKS, UID, aktivitas, atau status" aria-label="Cari jejak audit" className="w-full min-w-0 bg-transparent text-xs text-white outline-none placeholder:text-slate-500" /></label>
          <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as SourceFilter)} aria-label="Filter sumber audit" className="min-h-10 rounded-xl border border-white/10 bg-slate-900 px-3 text-xs text-white"><option value="semua">Semua sumber</option><option value="service-event">Riwayat layanan</option><option value="field-visit">Kunjungan lapangan</option></select>
          <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} aria-label="Tanggal awal audit" className="min-h-10 rounded-xl border border-white/10 bg-slate-900 px-3 text-xs text-white" />
          <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} aria-label="Tanggal akhir audit" className="min-h-10 rounded-xl border border-white/10 bg-slate-900 px-3 text-xs text-white" />
        </div>
        {error && <p role="alert" className="mt-3 rounded-xl border border-rose-300/20 bg-rose-950/30 p-3 text-xs text-rose-100">{error}</p>}
        {loading ? <p role="status" className="py-10 text-center text-xs text-emerald-100">Memuat jejak audit…</p> : (
          <div className="mt-3 space-y-2">
            {filteredEntries.map((entry) => (
              <article key={entry.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><strong className="text-xs text-slate-100">{entry.label}</strong><span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] text-slate-300">{sourceLabel(entry.source)}</span></div>
                    <p className="mt-1 text-[10px] text-slate-400">ID PPKS: {entry.ppksId || 'Tidak tersedia'} · {entry.status.replace(/-/g, ' ')}</p>
                    <p className="mt-1 break-all text-[10px] text-slate-500">Pelaku UID: {entry.actorUid || 'Tidak tersedia'} · UID penugasan: {entry.assignedToUid || 'Tidak tersedia'}</p>
                  </div>
                  <div className="shrink-0 text-right"><strong className="block text-[10px] text-emerald-100">{formatDate(entry.createdAt)}</strong><span className="text-[9px] text-slate-500">Tanggal kegiatan: {entry.eventDate || 'Tidak dicatat'}</span></div>
                </div>
              </article>
            ))}
            {!filteredEntries.length && <p className="py-10 text-center text-xs text-slate-400">Tidak ada event pada filter ini.</p>}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-amber-200/15 bg-amber-950/20 p-3 text-[10px] leading-relaxed text-amber-100/85">
        <div className="mb-1 flex items-center gap-2 font-bold"><AlertTriangle className="h-4 w-4" /> Batas cakupan audit</div>
        Panel ini memuat maksimal 250 event terbaru dari masing-masing koleksi <code>ppksServiceEvents</code> dan <code>fieldVisits</code>. Ringkasan catatan bebas sengaja tidak ditampilkan untuk mengurangi paparan data pribadi. Panel ini belum mencakup login berhasil/gagal, perubahan klaim peran, konfigurasi Firebase/Cloudflare, aktivitas Google Sheets/Drive, atau penghapusan dokumen. Karena itu, panel ini adalah jejak audit operasional, bukan SIEM atau log keamanan menyeluruh.
      </section>
    </div>
  );
};
