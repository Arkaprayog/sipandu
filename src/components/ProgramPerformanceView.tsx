import React, { useMemo, useState } from 'react';
import { BarChart3, Download, FileSpreadsheet, CalendarRange, Users, HandHeart, Footprints, AlertCircle } from 'lucide-react';
import type { PPKSRecord, PPKSServiceStatus, FieldVisitRecord } from '../types';

interface Props {
  ppksList: PPKSRecord[];
  serviceStatuses: PPKSServiceStatus[];
  visits: FieldVisitRecord[];
}

const csvCell = (value: unknown) => '"' + String(value ?? '').replace(/"/g, '""') + '"';
const inRange = (value: string, from: string, to: string) => {
  const day = String(value || '').slice(0, 10);
  return Boolean(day && (!from || day >= from) && (!to || day <= to));
};

export const ProgramPerformanceView: React.FC<Props> = ({ ppksList, serviceStatuses, visits }) => {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const filteredVisits = useMemo(() => visits.filter((visit) => inRange(visit.visitDate, from, to)), [visits, from, to]);
  const statusCounts = useMemo(() => {
    const nutrition: Record<string, number> = {};
    const entrepreneurship: Record<string, number> = {};
    const therapy: Record<string, number> = {};
    serviceStatuses.forEach((item) => {
      nutrition[item.nutritionStatus] = (nutrition[item.nutritionStatus] || 0) + 1;
      entrepreneurship[item.entrepreneurshipStatus] = (entrepreneurship[item.entrepreneurshipStatus] || 0) + 1;
      therapy[item.psychosocialStatus] = (therapy[item.psychosocialStatus] || 0) + 1;
    });
    return { nutrition, entrepreneurship, therapy };
  }, [serviceStatuses]);
  const countBy = (items: Record<string, number>, key: string) => items[key] || 0;
  const visitOutcomes = useMemo(() => filteredVisits.reduce((acc, visit) => {
    acc[visit.outcome] = (acc[visit.outcome] || 0) + 1;
    return acc;
  }, {} as Record<string, number>), [filteredVisits]);
  const exportCsv = () => {
    const rows: unknown[][] = [
      ['LAPORAN KINERJA SIPANDU'],
      ['Periode kunjungan', from || 'Semua tanggal', to || 'Semua tanggal'],
      ['Catatan metodologi', 'Status layanan adalah snapshot status terkini dari record yang dimuat; bukan jumlah penyaluran historis. Kunjungan dihitung dari tanggal kunjungan dalam filter.'],
      [],
      ['INDIKATOR ROSTER', 'JUMLAH'],
      ['PPKS dalam roster aktif', ppksList.length],
      ['Record status layanan tersedia', serviceStatuses.length],
      ['Kunjungan pada periode', filteredVisits.length],
      [],
      ['STATUS LAYANAN TERKINI', 'BELUM DIVERIFIKASI', 'DIBUTUHKAN', 'DALAM PROSES', 'DITERIMA', 'TIDAK DIBUTUHKAN'],
      ['Pemenuhan nutrisi', ...['belum-diverifikasi','dibutuhkan','dalam-proses','diterima','tidak-dibutuhkan'].map(k => countBy(statusCounts.nutrition,k))],
      ['Kewirausahaan', ...['belum-diverifikasi','dibutuhkan','dalam-proses','diterima','tidak-dibutuhkan'].map(k => countBy(statusCounts.entrepreneurship,k))],
      ['Terapi psikososial', ...['belum-dimulai','terjadwal','aktif','selesai'].map(k => countBy(statusCounts.therapy,k))],
      [],
      ['HASIL KUNJUNGAN', 'JUMLAH'],
      ...Object.entries(visitOutcomes),
    ];
    const content = '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' }));
    const anchor = document.createElement('a'); anchor.href = url;
    anchor.download = 'SIPANDU-Laporan-Kinerja-' + new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }) + '.csv';
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
  };
  const serviceTotal = serviceStatuses.length;
  const visitTypes = filteredVisits.reduce((acc, visit) => { acc[visit.visitType] = (acc[visit.visitType] || 0) + 1; return acc; }, {} as Record<string, number>);
  const statusRows = [
    { title: 'Pemenuhan nutrisi', values: statusCounts.nutrition, keys: ['belum-diverifikasi','dibutuhkan','dalam-proses','diterima','tidak-dibutuhkan'] },
    { title: 'Bantuan kewirausahaan', values: statusCounts.entrepreneurship, keys: ['belum-diverifikasi','dibutuhkan','dalam-proses','diterima','tidak-dibutuhkan'] },
    { title: 'Terapi psikososial', values: statusCounts.therapy, keys: ['belum-dimulai','terjadwal','aktif','selesai'] },
  ];
  const labels: Record<string,string> = { 'belum-diverifikasi':'Belum diverifikasi','dibutuhkan':'Dibutuhkan','dalam-proses':'Dalam proses','diterima':'Diterima','tidak-dibutuhkan':'Tidak dibutuhkan','belum-dimulai':'Belum dimulai','terjadwal':'Terjadwal','aktif':'Aktif','selesai':'Selesai' };
  return <div className="space-y-4 pb-28 text-white">
    <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-emerald-950/70 via-[#10251e] to-slate-950/80 p-4 shadow-xl sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200"><BarChart3 className="h-4 w-4"/> PROGRAM PERFORMANCE</span><h2 className="mt-2 text-xl font-black sm:text-2xl">Laporan Kinerja & Evaluasi Program</h2><p className="mt-2 max-w-2xl text-xs leading-relaxed text-slate-300">Ringkasan operasional berdasarkan roster, status layanan terkini, dan catatan kunjungan yang dapat diakses akun Anda.</p></div>
        <button type="button" onClick={exportCsv} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-emerald-200/20 bg-emerald-400/10 px-3 py-2 text-xs font-bold text-emerald-100"><Download className="h-4 w-4"/> Ekspor CSV</button>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <article className="rounded-2xl border border-white/10 bg-white/[0.06] p-3"><Users className="h-4 w-4 text-emerald-200"/><strong className="mt-2 block text-2xl font-black tabular-nums">{ppksList.length.toLocaleString('id-ID')}</strong><span className="text-[10px] text-slate-300">PPKS dalam roster</span></article>
        <article className="rounded-2xl border border-white/10 bg-white/[0.06] p-3"><HandHeart className="h-4 w-4 text-sky-200"/><strong className="mt-2 block text-2xl font-black tabular-nums">{serviceTotal.toLocaleString('id-ID')}</strong><span className="text-[10px] text-slate-300">Record status layanan</span></article>
        <article className="rounded-2xl border border-white/10 bg-white/[0.06] p-3"><Footprints className="h-4 w-4 text-violet-200"/><strong className="mt-2 block text-2xl font-black tabular-nums">{filteredVisits.length.toLocaleString('id-ID')}</strong><span className="text-[10px] text-slate-300">Kunjungan terfilter</span></article>
        <article className="rounded-2xl border border-white/10 bg-white/[0.06] p-3"><CalendarRange className="h-4 w-4 text-amber-200"/><strong className="mt-2 block text-lg font-black">{from || 'Semua'} – {to || 'tanggal'}</strong><span className="text-[10px] text-slate-300">Rentang kunjungan</span></article>
      </div>
    </section>
    <section className="rounded-2xl border border-white/10 bg-black/25 p-4 sm:p-5">
      <h3 className="text-sm font-extrabold text-white">Filter periode kunjungan</h3>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-[10px] font-semibold text-neutral-300">Dari tanggal<input type="date" value={from} max={to || undefined} onChange={e=>setFrom(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-[#142618] px-3 text-xs text-white"/></label>
        <label className="text-[10px] font-semibold text-neutral-300">Sampai tanggal<input type="date" value={to} min={from || undefined} onChange={e=>setTo(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-[#142618] px-3 text-xs text-white"/></label>
      </div>
    </section>
    <section className="rounded-2xl border border-white/10 bg-black/25 p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2"><FileSpreadsheet className="h-4 w-4 text-emerald-200"/><h3 className="text-sm font-extrabold">Status layanan saat ini</h3></div>
      {serviceTotal === 0 ? <p className="rounded-xl border border-dashed border-white/15 p-5 text-xs text-neutral-400">Belum ada record status layanan yang tersedia untuk akun ini. Angka tidak diisi dengan perkiraan.</p> : <div className="space-y-4">{statusRows.map(row=><div key={row.title}><h4 className="mb-2 text-xs font-bold text-sky-100">{row.title}</h4><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{row.keys.map(key=><div key={key} className="rounded-xl border border-white/10 bg-white/[0.04] p-3"><strong className="block text-xl tabular-nums">{countBy(row.values,key).toLocaleString('id-ID')}</strong><span className="text-[10px] text-neutral-400">{labels[key]}</span></div>)}</div></div>)}</div>}
      <p className="mt-4 text-[10px] leading-relaxed text-neutral-500">Catatan: status layanan merupakan snapshot terkini. Status “Diterima” mencerminkan status yang dicatat petugas, bukan bukti transaksi atau jumlah bantuan historis. Riwayat penyaluran harus dianalisis dari event historis jika datanya tersedia.</p>
    </section>
    <section className="rounded-2xl border border-white/10 bg-black/25 p-4 sm:p-5">
      <h3 className="text-sm font-extrabold">Aktivitas pendampingan lapangan</h3>
      <p className="mt-1 text-[10px] text-neutral-400">Jumlah catatan kunjungan berdasarkan tanggal dan jenis kunjungan, bukan jumlah unik PPKS.</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{Object.entries(visitTypes).length ? Object.entries(visitTypes).map(([key,value])=><div key={key} className="rounded-xl border border-white/10 bg-white/[0.04] p-3"><strong className="block text-xl tabular-nums">{value}</strong><span className="text-[10px] text-neutral-400">{key.replace(/-/g,' ')}</span></div>) : <p className="col-span-2 rounded-xl border border-dashed border-white/15 p-4 text-xs text-neutral-400">Tidak ada catatan kunjungan pada periode ini.</p>}</div>
      <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-300/15 bg-amber-950/20 p-3 text-[10px] leading-relaxed text-amber-100"><AlertCircle className="h-4 w-4 shrink-0"/> Laporan ini menampilkan data yang sudah tercatat. Ketiadaan catatan tidak berarti layanan atau bantuan tidak pernah diberikan.</div>
    </section>
  </div>;
};
