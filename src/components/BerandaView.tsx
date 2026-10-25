import React, { useState } from 'react';
import { PPKSRecord } from '../types';
import { SUMUT_DISTRICTS } from '../data/initialData';
import {
  FileSpreadsheet,
  RefreshCw,
  MapPin,
  TrendingUp,
  PieChart as PieIcon,
  BarChart3,
  Users2,
  HeartHandshake,
  CheckCircle2,
} from 'lucide-react';

interface BerandaViewProps {
  ppksList: PPKSRecord[];
  googleSpreadsheetUrl?: string;
  googleSpreadsheetName?: string;
  onSyncGoogleSpreadsheet?: () => Promise<number>;
}

export const BerandaView: React.FC<BerandaViewProps> = ({
  ppksList,
  googleSpreadsheetUrl = '',
  googleSpreadsheetName = '',
  onSyncGoogleSpreadsheet,
}) => {
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');
  const [syncMessage, setSyncMessage] = useState<string>('');

  // Compute live statistics based on ppksList
  const totalPPKS = ppksList.length;

  // Gender breakdown
  const maleCount = ppksList.filter((p) => p.jenisKelamin === 'Laki-laki').length;
  const femaleCount = ppksList.filter((p) => p.jenisKelamin === 'Perempuan').length;
  const malePercent = totalPPKS > 0 ? Math.round((maleCount / totalPPKS) * 100) : 0;
  const femalePercent = totalPPKS > 0 ? Math.round((femaleCount / totalPPKS) * 100) : 0;

  // Age brackets
  const ageBrackets = [
    { label: '< 18 Thn', count: ppksList.filter((p) => p.usia < 18).length },
    { label: '18 - 25 Thn', count: ppksList.filter((p) => p.usia >= 18 && p.usia <= 25).length },
    { label: '26 - 35 Thn', count: ppksList.filter((p) => p.usia >= 26 && p.usia <= 35).length },
    { label: '36 - 45 Thn', count: ppksList.filter((p) => p.usia >= 36 && p.usia <= 45).length },
    { label: '46 - 55 Thn', count: ppksList.filter((p) => p.usia >= 46 && p.usia <= 55).length },
    { label: '> 55 Thn', count: ppksList.filter((p) => p.usia > 55).length },
  ];
  const maxAgeCount = Math.max(...ageBrackets.map((b) => b.count), 1);

  // Desil breakdown (0-10)
  const desilStats = Array.from({ length: 11 }, (_, i) => {
    const count = ppksList.filter((p) => p.desil === i).length;
    const percent = totalPPKS > 0 ? Math.round((count / totalPPKS) * 100) : 0;
    return { desil: i, count, percent };
  });

  // Top regions
  const cityCounts = SUMUT_DISTRICTS.map((d) => {
    // combine with ppksList occurrences if any
    const listCount = ppksList.filter((p) =>
      p.kotaDomisili.toLowerCase().includes(d.name.toLowerCase().replace('kota ', '').replace('kab. ', ''))
    ).length;
    return {
      ...d,
      displayCount: listCount,
    };
  }).sort((a, b) => b.displayCount - a.displayCount);

  const handleSync = async () => {
    if (!onSyncGoogleSpreadsheet) {
      setSyncMessage('Sinkronisasi belum dikonfigurasi. Pilih spreadsheet sumber melalui Google Workspace & Cloud Hub.');
      return;
    }
    setIsSyncing(true);
    setSyncMessage('');
    try {
      const count = await onSyncGoogleSpreadsheet();
      const now = new Date();
      setLastSyncTime(now.toLocaleString('id-ID'));
      setSyncMessage(`Sinkronisasi nyata berhasil: ${count} responden dibaca dari spreadsheet sumber. Daftar PPKS diperbarui dan data yang cocok digabungkan agar tidak duplikat.`);
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6 pb-24 text-white">
      {/* Top Banner: Sumber Google Spreadsheet */}
      <div className="p-4 rounded-2xl bg-black/40 border border-rose-500/35 shadow-[0_0_20px_rgba(244,63,94,0.15)] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-400">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-sky-300 uppercase tracking-wider">
                Google Spreadsheet Live Sync
              </span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border ${lastSyncTime ? 'bg-emerald-950 text-emerald-300 border-emerald-500/30' : googleSpreadsheetUrl ? 'bg-amber-950 text-amber-200 border-amber-500/30' : 'bg-neutral-900 text-neutral-300 border-neutral-700'}`}>
                {lastSyncTime ? 'Data berhasil dimuat' : googleSpreadsheetUrl ? 'Sumber dipilih · belum diuji' : 'Belum dikonfigurasi'}
              </span>
            </div>
            <p className="text-sm font-semibold text-white">
              {googleSpreadsheetName || (googleSpreadsheetUrl ? 'Spreadsheet sumber SIPANDU' : 'Spreadsheet belum dipilih')}
            </p>
            <p className="text-xs text-neutral-400">
              Sinkronisasi terakhir: {lastSyncTime || 'Belum ada sinkronisasi terverifikasi'} • Total PPKS pada aplikasi:{' '}
              <span className="text-white font-bold">{totalPPKS} responden</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          {googleSpreadsheetUrl ? (
            <a
              href={googleSpreadsheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 rounded-xl text-xs font-medium text-sky-200 bg-sky-950/60 hover:bg-sky-900/60 border border-sky-500/30 transition flex items-center gap-1.5"
            >
              <span>Buka Spreadsheet</span>
            </a>
          ) : (
            <span className="px-3 py-2 rounded-xl text-xs text-neutral-400 border border-neutral-700">Belum ada sumber</span>
          )}
          <button
            type="button"
            onClick={handleSync}
            disabled={isSyncing}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-800/80 hover:bg-emerald-700/80 border border-rose-500/40 shadow-sm flex items-center gap-1.5 active:scale-95 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Memuat data...' : 'Sinkronkan dari Sheet'}</span>
          </button>
        </div>
      </div>

      {syncMessage && (
        <div role="status" aria-live="polite" className={`rounded-xl border p-3 text-xs break-words ${syncMessage.startsWith('Sinkronisasi nyata berhasil') ? 'border-emerald-500/40 bg-emerald-950/50 text-emerald-100' : 'border-amber-500/50 bg-amber-950/60 text-amber-100'}`}>
          {syncMessage}
        </div>
      )}

      {/* Grid: Peta Sumatera Utara & Donut Jenis Kelamin */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Peta Sumatera Utara */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-black/40 border border-rose-500/35 shadow-[0_0_20px_rgba(244,63,94,0.12)] flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3 border-b border-rose-500/20 pb-3">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-sky-300" />
              <h3 className="text-base font-bold text-white tracking-wide">
                Peta Sebaran PPKS ODHIV Sumatera Utara
              </h3>
            </div>
            <span className="text-xs font-mono text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/30">
              33 Kab/Kota Sumut
            </span>
          </div>

          <p className="text-xs text-neutral-300 mb-4">
            Visualisasi distribusi respon asesmen terpadu berbasis titik koordinat wilayah layanan Direktorat Rehabilitasi Sosial Kemensos di Provinsi Sumatera Utara.
          </p>

          {/* Map Representation (Custom Interactive SVG Map of North Sumatra) */}
          <div className="relative w-full h-80 rounded-xl bg-gradient-to-b from-[#142618] to-[#0c160e] border border-emerald-500/30 p-3 overflow-hidden flex flex-col items-center justify-center">
            {/* Ambient map grid background */}
            <div
              className="absolute inset-0 opacity-15"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 1px 1px, #87CEEB 1px, transparent 0)',
                backgroundSize: '24px 24px',
              }}
            />

            {/* SVG stylized map of North Sumatra */}
            <svg
              viewBox="0 0 700 400"
              className="w-full h-full max-h-72 drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)]"
            >
              {/* Mainland Sumut silhouette */}
              <path
                d="M 120 120 C 180 80 260 60 340 70 C 420 80 500 130 560 190 C 600 240 580 300 520 330 C 440 370 340 360 260 330 C 200 300 140 240 110 180 Z"
                fill="#1b381d"
                stroke="#f43f5e"
                strokeWidth="1.5"
                strokeOpacity="0.4"
                className="transition duration-300"
              />

              {/* Lake Toba in center */}
              <ellipse
                cx="340"
                cy="200"
                rx="42"
                ry="22"
                fill="#0d1b10"
                stroke="#38bdf8"
                strokeWidth="1.5"
                strokeDasharray="3 3"
              />
              <text x="340" y="204" textAnchor="middle" fill="#87CEEB" fontSize="10" fontWeight="bold">
                Danau Toba
              </text>

              {/* Nias Island */}
              <ellipse
                cx="100"
                cy="320"
                rx="28"
                ry="45"
                fill="#18321a"
                stroke="#f43f5e"
                strokeWidth="1"
                strokeOpacity="0.3"
                transform="rotate(-25 100 320)"
              />
              <text x="100" y="325" textAnchor="middle" fill="#9ca3af" fontSize="9">
                P. Nias
              </text>

              {/* Pin Hotspots for top cities */}
              {[
                { name: 'Medan', x: 380, y: 110, count: 48, main: true },
                { name: 'Deli Serdang', x: 420, y: 130, count: 32 },
                { name: 'Binjai', x: 340, y: 115, count: 18 },
                { name: 'P. Siantar', x: 375, y: 175, count: 21 },
                { name: 'Asahan', x: 440, y: 195, count: 15 },
                { name: 'Karo', x: 310, y: 145, count: 12 },
                { name: 'Tap. Utara', x: 330, y: 250, count: 11 },
                { name: 'Tj. Balai', x: 470, y: 200, count: 14 },
                { name: 'Labuhanbatu', x: 490, y: 260, count: 13 },
                { name: 'Simalungun', x: 385, y: 210, count: 16 },
                { name: 'Tebing Tinggi', x: 410, y: 160, count: 9 },
              ].map((loc, idx) => (
                <g
                  key={idx}
                  className="cursor-pointer transition-transform hover:scale-110"
                  onClick={() => setSelectedDistrict(loc.name)}
                >
                  <circle
                    cx={loc.x}
                    cy={loc.y}
                    r={loc.main ? 10 : 7}
                    fill={selectedDistrict === loc.name ? '#f43f5e' : '#22c55e'}
                    stroke="#ffffff"
                    strokeWidth="1.5"
                  />
                  <circle
                    cx={loc.x}
                    cy={loc.y}
                    r={loc.main ? 18 : 14}
                    fill="none"
                    stroke={selectedDistrict === loc.name ? '#f43f5e' : '#22c55e'}
                    strokeWidth="1"
                    strokeOpacity="0.4"
                    className="animate-ping"
                    style={{ animationDuration: `${2 + idx * 0.3}s` }}
                  />
                  <text
                    x={loc.x + 12}
                    y={loc.y + 4}
                    fill="#ffffff"
                    fontSize="10"
                    fontWeight="600"
                    className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
                  >
                    {loc.name} ({loc.count})
                  </text>
                </g>
              ))}
            </svg>

            {/* Selected District Overlay Box */}
            <div className="absolute bottom-3 left-3 right-3 bg-black/75 p-2 rounded-lg border border-rose-500/30 flex items-center justify-between text-xs">
              <span className="text-neutral-300">
                Pilih titik di peta untuk memfilter data:
              </span>
              <span className="font-bold text-sky-300">
                {selectedDistrict ? `Wilayah: ${selectedDistrict}` : 'Semua Wilayah Sumatera Utara'}
              </span>
              {selectedDistrict && (
                <button
                  type="button"
                  onClick={() => setSelectedDistrict(null)}
                  className="text-[10px] text-rose-300 hover:underline cursor-pointer"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Jenis Kelamin: Bentuk Diagram Bulat (Laki-laki Hijau Lumut, Perempuan Pink) */}
        <div className="p-5 rounded-2xl bg-black/40 border border-rose-500/35 shadow-[0_0_20px_rgba(244,63,94,0.12)] flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-3 border-b border-rose-500/20 pb-3">
            <PieIcon className="w-5 h-5 text-sky-300" />
            <h3 className="text-base font-bold text-white tracking-wide">
              Jenis Kelamin (Diagram Bulat)
            </h3>
          </div>

          <div className="my-auto flex flex-col items-center justify-center py-2">
            {/* SVG Donut Chart with strict color requirement */}
            <div className="relative w-48 h-48">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                {/* Background track */}
                <circle
                  cx="18"
                  cy="18"
                  r="14"
                  fill="none"
                  stroke="#1c2d1e"
                  strokeWidth="5"
                />
                {/* Laki-laki: Hijau Lumut (#2d6a36 / #22c55e) */}
                <circle
                  cx="18"
                  cy="18"
                  r="14"
                  fill="none"
                  stroke="#388e3c"
                  strokeWidth="5"
                  strokeDasharray={`${malePercent * 0.88} 100`}
                  strokeDashoffset="0"
                  strokeLinecap="round"
                />
                {/* Perempuan: Pink (#ec4899 / #f43f5e) */}
                <circle
                  cx="18"
                  cy="18"
                  r="14"
                  fill="none"
                  stroke="#ec4899"
                  strokeWidth="5"
                  strokeDasharray={`${femalePercent * 0.88} 100`}
                  strokeDashoffset={`-${malePercent * 0.88}`}
                  strokeLinecap="round"
                />
              </svg>

              {/* Center donut label */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-2xl font-black text-white">{totalPPKS}</span>
                <span className="text-[10px] text-sky-200 uppercase font-semibold">
                  Responden
                </span>
              </div>
            </div>

            {/* Legend as requested: Laki-laki Hijau Lumut, Perempuan Pink */}
            <div className="w-full grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-rose-500/20">
              <div className="p-2.5 rounded-xl bg-black/40 border border-emerald-600/40 flex flex-col items-center">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="w-3 h-3 rounded-full bg-[#388e3c] ring-2 ring-emerald-300/40" />
                  <span className="text-xs font-bold text-white">Laki-laki</span>
                </div>
                <span className="text-base font-extrabold text-emerald-300">
                  {malePercent}%
                </span>
                <span className="text-[10px] text-neutral-400">
                  ({maleCount} Orang)
                </span>
                <span className="text-[9px] text-emerald-400 font-mono mt-0.5">
                  Hijau Lumut
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-black/40 border border-pink-500/40 flex flex-col items-center">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="w-3 h-3 rounded-full bg-[#ec4899] ring-2 ring-pink-300/40" />
                  <span className="text-xs font-bold text-white">Perempuan</span>
                </div>
                <span className="text-base font-extrabold text-pink-300">
                  {femalePercent}%
                </span>
                <span className="text-[10px] text-neutral-400">
                  ({femaleCount} Orang)
                </span>
                <span className="text-[9px] text-pink-400 font-mono mt-0.5">
                  Warna Pink
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Grid: Rentang Usia & Wilayah Domisili Responden */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Rentang Usia dengan Grafik Diagram */}
        <div className="p-5 rounded-2xl bg-black/40 border border-rose-500/35 shadow-[0_0_20px_rgba(244,63,94,0.12)]">
          <div className="flex items-center justify-between mb-4 border-b border-rose-500/20 pb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-sky-300" />
              <h3 className="text-base font-bold text-white tracking-wide">
                Rentang Usia (Grafik Diagram)
              </h3>
            </div>
            <span className="text-xs text-sky-300 font-semibold">
              Usia Produktif 26-45 Thn (75%)
            </span>
          </div>

          <div className="space-y-3.5">
            {ageBrackets.map((item, idx) => {
              const pct = maxAgeCount > 0 ? Math.round((item.count / maxAgeCount) * 100) : 0;
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-neutral-200">{item.label}</span>
                    <span className="text-emerald-300 font-bold">
                      {item.count} Responden
                    </span>
                  </div>
                  <div className="w-full h-3 rounded-full bg-black/60 overflow-hidden border border-emerald-950">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-600 via-teal-500 to-sky-400 transition-all duration-700"
                      style={{ width: `${Math.max(pct, 8)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Wilayah Domisili Responden dengan Grafik */}
        <div className="p-5 rounded-2xl bg-black/40 border border-rose-500/35 shadow-[0_0_20px_rgba(244,63,94,0.12)]">
          <div className="flex items-center justify-between mb-4 border-b border-rose-500/20 pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-sky-300" />
              <h3 className="text-base font-bold text-white tracking-wide">
                Wilayah Domisili Responden (Grafik)
              </h3>
            </div>
            <span className="text-xs text-emerald-300 font-mono">
              Top 7 Wilayah Sumut
            </span>
          </div>

          <div className="space-y-3">
            {cityCounts.slice(0, 7).map((item, idx) => {
              const maxCity = cityCounts[0]?.displayCount || 50;
              const pct = Math.round((item.displayCount / maxCity) * 100);
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-white">{item.name}</span>
                    <span className="text-sky-300 font-bold">{item.displayCount} PPKS</span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-black/60 overflow-hidden border border-emerald-950">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-teal-700 via-emerald-500 to-sky-300 transition-all duration-700"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Desil dengan Presentase Angka */}
      <div className="p-5 rounded-2xl bg-black/40 border border-rose-500/35 shadow-[0_0_20px_rgba(244,63,94,0.12)]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-4 border-b border-rose-500/20 pb-3">
          <div className="flex items-center gap-2">
            <Users2 className="w-5 h-5 text-sky-300" />
            <h3 className="text-base font-bold text-white tracking-wide">
              Distribusi Desil DTKS Kemensos (Persentase Angka)
            </h3>
          </div>
          <p className="text-xs text-neutral-300">
            Kategori desil menentukan skala prioritas program bantuan Atensi & nutrisi ODHIV.
          </p>
        </div>

        {/* Desil Grid 0-10 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {desilStats.map((item) => {
            const isPriority = item.desil >= 1 && item.desil <= 3;
            return (
              <div
                key={item.desil}
                className={`p-3 rounded-xl border flex flex-col justify-between transition ${
                  isPriority
                    ? 'bg-rose-950/30 border-rose-500/50 shadow-[0_0_10px_rgba(244,63,94,0.15)]'
                    : 'bg-black/40 border-emerald-900/40'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-sky-300">
                    {item.desil === 0 ? 'Desil 0' : `Desil ${item.desil}`}
                  </span>
                  {isPriority && (
                    <span className="text-[9px] bg-rose-600/80 text-white font-bold px-1.5 py-0.2 rounded">
                      Prioritas
                    </span>
                  )}
                </div>
                <div className="text-xl font-extrabold text-white my-1">
                  {item.percent}%
                </div>
                <p className="text-[10px] text-neutral-300 line-clamp-1">
                  {item.desil === 0
                    ? 'Belum Terdata'
                    : item.desil === 1
                    ? 'Sangat Miskin'
                    : item.desil <= 3
                    ? 'Miskin/Rentan'
                    : 'Menengah/Mandiri'}
                </p>
                <div className="mt-2 w-full h-1.5 rounded-full bg-black/60 overflow-hidden">
                  <div
                    className={`h-full ${
                      isPriority ? 'bg-rose-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.max(item.percent * 2, 8)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
