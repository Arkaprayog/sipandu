import React, { useMemo, useState } from 'react';
import { Download, MapPinned, Search, UsersRound, AlertCircle, LocateFixed } from 'lucide-react';
import type { PPKSRecord } from '../types';
import { SUMUT_DISTRICTS } from '../data/initialData';
import { aggregatePPKSByRegion } from '../lib/regionalIntelligence';

interface RegionalIntelligenceViewProps {
  ppksList: PPKSRecord[];
}

const csvCell = (value: unknown) => '"' + String(value ?? '').replace(/"/g, '""') + '"';

export const RegionalIntelligenceView: React.FC<RegionalIntelligenceViewProps> = ({ ppksList }) => {
  const [searchText, setSearchText] = useState('');
  const [selectedRegionId, setSelectedRegionId] = useState('');
  const summary = useMemo(() => aggregatePPKSByRegion(ppksList), [ppksList]);
  const maxCount = Math.max(1, ...summary.regions.map((item) => item.count));
  const regionsWithRecords = summary.regions.filter((item) => item.count > 0).length;
  const normalizedSearch = searchText.trim().toLocaleLowerCase('id-ID');
  const filteredRegions = summary.regions.filter((item) =>
    !normalizedSearch || item.name.toLocaleLowerCase('id-ID').includes(normalizedSearch)
  );
  const selectedRegion = summary.regions.find((item) => item.id === selectedRegionId) || null;

  const minLat = Math.min(...SUMUT_DISTRICTS.map((item) => item.lat)) - 0.18;
  const maxLat = Math.max(...SUMUT_DISTRICTS.map((item) => item.lat)) + 0.18;
  const minLng = Math.min(...SUMUT_DISTRICTS.map((item) => item.lng)) - 0.18;
  const maxLng = Math.max(...SUMUT_DISTRICTS.map((item) => item.lng)) + 0.18;
  const pointPosition = (lat: number, lng: number) => ({
    left: ((lng - minLng) / (maxLng - minLng)) * 100,
    top: (1 - (lat - minLat) / (maxLat - minLat)) * 100,
  });

  const exportSummary = () => {
    const rows = [
      ['Wilayah', 'Jumlah PPKS pada roster', 'Tipe koordinat'],
      ...summary.regions.map((item) => [item.name, item.count, 'Titik referensi administratif']),
      ['Wilayah tidak dikenali', summary.unmatchedRecords, 'Tidak dipetakan'],
      ['Wilayah belum diisi', summary.missingRegionRecords, 'Tidak dipetakan'],
    ];
    const content = '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'SIPANDU-Sebaran-Wilayah-PPKS-' + new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }) + '.csv';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 pb-28 text-white">
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-emerald-950/65 via-[#10251e] to-slate-950/70 p-4 shadow-xl sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200"><MapPinned className="h-4 w-4" /> REGIONAL INTELLIGENCE</span>
            <h2 className="mt-2 text-xl font-black tracking-tight sm:text-2xl">Peta Sebaran PPKS Sumatera Utara</h2>
            <p className="mt-2 max-w-2xl text-xs leading-relaxed text-slate-300">Sebaran dihitung dari kabupaten/kota domisili yang tercatat pada roster. Titik pada peta adalah pusat referensi wilayah, bukan koordinat tempat tinggal PPKS.</p>
          </div>
          <button type="button" onClick={exportSummary} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-emerald-200/20 bg-emerald-400/10 px-3 py-2 text-xs font-bold text-emerald-100 transition hover:bg-emerald-400/20"><Download className="h-4 w-4" /> Ekspor CSV</button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <article className="rounded-2xl border border-white/10 bg-white/[0.06] p-3"><UsersRound className="h-4 w-4 text-emerald-200" /><strong className="mt-2 block text-2xl font-black tabular-nums">{ppksList.length.toLocaleString('id-ID')}</strong><span className="text-[10px] text-slate-300">Total dalam roster</span></article>
          <article className="rounded-2xl border border-white/10 bg-white/[0.06] p-3"><MapPinned className="h-4 w-4 text-sky-200" /><strong className="mt-2 block text-2xl font-black tabular-nums">{regionsWithRecords}/33</strong><span className="text-[10px] text-slate-300">Wilayah terdata</span></article>
          <article className="rounded-2xl border border-white/10 bg-white/[0.06] p-3"><AlertCircle className="h-4 w-4 text-amber-200" /><strong className="mt-2 block text-2xl font-black tabular-nums">{summary.unmatchedRecords}</strong><span className="text-[10px] text-slate-300">Wilayah perlu dicocokkan</span></article>
          <article className="rounded-2xl border border-white/10 bg-white/[0.06] p-3"><LocateFixed className="h-4 w-4 text-violet-200" /><strong className="mt-2 block text-2xl font-black tabular-nums">{summary.missingRegionRecords}</strong><span className="text-[10px] text-slate-300">Wilayah belum diisi</span></article>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.35fr_.85fr]">
        <article className="overflow-hidden rounded-3xl border border-white/10 bg-[#0d1a17]/85 p-3 shadow-xl sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><h3 className="text-sm font-extrabold">Plot pusat wilayah administratif</h3><p className="mt-1 text-[10px] text-slate-400">Pilih titik untuk melihat jumlah agregat · 33 kabupaten/kota</p></div>
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[9px] text-slate-300">Indikatif · bukan geolokasi individu</span>
          </div>
          <div className="relative mt-4 h-[430px] overflow-hidden rounded-2xl border border-emerald-100/10 bg-[radial-gradient(ellipse_at_52%_42%,rgba(16,185,129,.15),transparent_58%),linear-gradient(140deg,#102e2a,#0b191e_65%,#11251d)]">
            <svg viewBox="0 0 1000 560" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
              {Array.from({ length: 9 }).map((_, index) => <line key={'v'+index} x1={80 + index * 105} y1="20" x2={80 + index * 105} y2="540" stroke="rgba(148,210,190,.10)" strokeDasharray="3 9" />)}
              {Array.from({ length: 6 }).map((_, index) => <line key={'h'+index} x1="20" y1={55 + index * 90} x2="980" y2={55 + index * 90} stroke="rgba(148,210,190,.10)" strokeDasharray="3 9" />)}
              <path d="M70 490 C210 425 175 355 300 315 S470 220 570 250 S750 170 920 65" fill="none" stroke="rgba(45,212,191,.16)" strokeWidth="2" strokeDasharray="5 12" />
              <text x="28" y="34" fill="rgba(203,232,220,.45)" fontSize="12">BARAT</text>
              <text x="865" y="34" fill="rgba(203,232,220,.45)" fontSize="12">TIMUR</text>
              <text x="30" y="540" fill="rgba(203,232,220,.40)" fontSize="11">SUMATERA UTARA · PLOT ADMINISTRATIF</text>
            </svg>
            {summary.regions.map((region) => {
              const position = pointPosition(region.lat, region.lng);
              const diameter = 16 + (region.count > 0 ? Math.sqrt(region.count / maxCount) * 28 : 0);
              const active = selectedRegionId === region.id;
              return (
                <button key={region.id} type="button" onClick={() => setSelectedRegionId(active ? '' : region.id)} aria-pressed={active} aria-label={region.name + ', ' + region.count + ' PPKS'} title={region.name + ': ' + region.count + ' PPKS'} className={'absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border text-[9px] font-black tabular-nums shadow-lg transition hover:z-20 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-white ' + (active ? 'border-white bg-emerald-300 text-emerald-950 ring-2 ring-emerald-100/60' : region.count ? 'border-emerald-100/80 bg-emerald-400/85 text-emerald-950' : 'border-white/30 bg-slate-700/80 text-slate-200')} style={{ left: position.left + '%', top: position.top + '%', width: diameter + 'px', height: diameter + 'px' }}>
                  {region.count > 0 ? region.count : ''}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-slate-400"><span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-emerald-300" /> Ada roster</span><span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-slate-500" /> Belum ada catatan roster</span><span>Ukuran titik mengikuti jumlah PPKS.</span></div>
          {selectedRegion && <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-emerald-200/20 bg-emerald-400/10 p-3"><div><strong className="block text-xs text-emerald-100">{selectedRegion.name}</strong><span className="text-[10px] text-slate-300">Jumlah pada roster: {selectedRegion.count.toLocaleString('id-ID')} PPKS</span></div><button type="button" onClick={() => setSelectedRegionId('')} className="text-[10px] font-bold text-emerald-100 underline">Tutup</button></div>}
        </article>

        <article className="rounded-3xl border border-white/10 bg-black/20 p-3 sm:p-5">
          <div className="mb-3"><h3 className="text-sm font-extrabold">Peringkat sebaran wilayah</h3><p className="mt-1 text-[10px] text-slate-400">Jumlah dihitung dari data domisili yang berhasil dicocokkan.</p></div>
          <label className="mb-3 flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3"><Search className="h-4 w-4 text-slate-400" /><input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Cari kabupaten/kota…" className="w-full min-w-0 bg-transparent text-xs text-white outline-none placeholder:text-slate-500" aria-label="Cari kabupaten atau kota" /></label>
          <div className="max-h-[430px] space-y-2 overflow-y-auto pr-1">
            {filteredRegions.map((region, index) => (
              <button key={region.id} type="button" onClick={() => setSelectedRegionId(region.id)} className={'w-full rounded-xl border p-3 text-left transition ' + (selectedRegionId === region.id ? 'border-emerald-200/40 bg-emerald-400/10' : 'border-white/[0.07] bg-white/[0.025] hover:bg-white/[0.06]')}>
                <div className="mb-2 flex items-center justify-between gap-2"><span className="min-w-0 truncate text-[11px] font-bold text-slate-100">{index + 1}. {region.name}</span><strong className="text-sm tabular-nums text-emerald-200">{region.count.toLocaleString('id-ID')}</strong></div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-teal-400 to-emerald-300" style={{ width: (region.count / maxCount * 100) + '%' }} /></div>
              </button>
            ))}
            {filteredRegions.length === 0 && <p className="py-8 text-center text-xs text-slate-400">Wilayah tidak ditemukan.</p>}
          </div>
        </article>
      </section>

      <p className="rounded-2xl border border-amber-200/15 bg-amber-950/20 p-3 text-[10px] leading-relaxed text-amber-100/80">Perlindungan privasi: peta ini tidak menampilkan nama, NIK, alamat, kontak, foto, atau titik rumah PPKS. Wilayah yang tidak dikenali atau belum diisi tetap dihitung terpisah dan tidak ditebak otomatis.</p>
    </div>
  );
};
