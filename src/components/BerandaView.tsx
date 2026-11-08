import React from 'react';
import { PPKSRecord } from '../types';
import { SUMUT_DISTRICTS } from '../data/initialData';
import { normalizeNorthSumatraRegion } from '../lib/ppksData';
import {
  FileSpreadsheet,
  ExternalLink,
  UsersRound,
  Building2,
  HeartHandshake,
  ChartColumnIncreasing,
  PieChart,
  UserRound,
  BriefcaseBusiness,
  Utensils,
  CircleHelp,
  Clock3,
} from 'lucide-react';

interface BerandaViewProps {
  ppksList: PPKSRecord[];
  googleSpreadsheetUrl?: string;
  googleSpreadsheetName?: string;
  onSyncGoogleSpreadsheet?: () => Promise<{ records: number; sourceDataRows: number; sourceRowsWithName: number; sampleRecordsFiltered: number }>;
  liveSyncStatus?: 'idle' | 'success' | 'paused' | 'error';
  liveSyncLastUpdatedAt?: string;
}

type DistributionItem = { label: string; count: number };

const formatPercent = (value: number, total: number) =>
  total > 0 ? Math.round((value / total) * 100) : 0;

const safeAge = (value: unknown) => {
  const age = Number(value);
  return Number.isFinite(age) && age > 0 ? age : 0;
};

export const BerandaView: React.FC<BerandaViewProps> = ({
  ppksList,
  googleSpreadsheetUrl = '',
  googleSpreadsheetName = '',
  liveSyncStatus = 'idle',
  liveSyncLastUpdatedAt,
}) => {
  // Every dashboard number is derived from the current SIPANDU respondent list.
  // No sample rows or illustrative counts are introduced in this component.
  const totalPPKS = ppksList.length;
  const maleCount = ppksList.filter((record) => record.jenisKelamin === 'Laki-laki').length;
  const femaleCount = ppksList.filter((record) => record.jenisKelamin === 'Perempuan').length;
  const knownGenderCount = maleCount + femaleCount;
  const genderUnknownCount = Math.max(totalPPKS - knownGenderCount, 0);

  const ageBrackets: DistributionItem[] = [
    { label: 'Di bawah 18 tahun', count: ppksList.filter((record) => safeAge(record.usia) > 0 && safeAge(record.usia) < 18).length },
    { label: '18–25 tahun', count: ppksList.filter((record) => safeAge(record.usia) >= 18 && safeAge(record.usia) <= 25).length },
    { label: '26–35 tahun', count: ppksList.filter((record) => safeAge(record.usia) >= 26 && safeAge(record.usia) <= 35).length },
    { label: '36–45 tahun', count: ppksList.filter((record) => safeAge(record.usia) >= 36 && safeAge(record.usia) <= 45).length },
    { label: '46–55 tahun', count: ppksList.filter((record) => safeAge(record.usia) >= 46 && safeAge(record.usia) <= 55).length },
    { label: 'Di atas 55 tahun', count: ppksList.filter((record) => safeAge(record.usia) > 55).length },
  ];
  const ageMissingCount = ppksList.filter((record) => safeAge(record.usia) === 0).length;
  const productiveAgeCount = ppksList.filter((record) => safeAge(record.usia) >= 26 && safeAge(record.usia) <= 45).length;
  const productiveAgePercent = formatPercent(productiveAgeCount, totalPPKS);

  // Prefer the longest known alias so overlapping names such as Nias Selatan
  // are assigned to one district only.
  const regionMatchers = SUMUT_DISTRICTS
    .flatMap((district) => [district.name, ...(district.aliases || [])].map((alias) => ({
      districtId: district.id,
      normalizedAlias: normalizeNorthSumatraRegion(alias),
    })))
    .filter((item) => item.normalizedAlias.length > 2)
    .sort((left, right) => right.normalizedAlias.length - left.normalizedAlias.length);

  const regionAssignments = ppksList.map((record) => {
    const original = String(record.kotaDomisili || '').trim();
    const normalized = normalizeNorthSumatraRegion(original);
    const match = normalized
      ? regionMatchers.find((candidate) => normalized.includes(candidate.normalizedAlias))
      : undefined;
    return { original, districtId: match?.districtId || '' };
  });

  const cityCounts = SUMUT_DISTRICTS.map((district) => ({
    ...district,
    displayCount: regionAssignments.filter((item) => item.districtId === district.id).length,
  })).sort((left, right) =>
    right.displayCount - left.displayCount || left.name.localeCompare(right.name, 'id')
  );
  const recognizedRegionCount = regionAssignments.filter((item) => item.districtId).length;
  const unmatchedRegionCount = regionAssignments.filter((item) => !item.districtId && item.original).length;
  const blankRegionCount = regionAssignments.filter((item) => !item.original).length;
  const topRegionCount = Math.max(cityCounts[0]?.displayCount || 0, 1);
  const coveredDistrictCount = cityCounts.filter((district) => district.displayCount > 0).length;

  const assistanceValues = ppksList.map((record) => String(record.jenisBantuan || '').trim());
  const entrepreneurshipCount = assistanceValues.filter((value) => /kewirausaha|wirausaha|modal usaha|bantuan usaha/i.test(value)).length;
  const nutritionCount = assistanceValues.filter((value) => /nutrisi|gizi|pemenuhan makanan/i.test(value)).length;
  const mappedAssistanceCount = entrepreneurshipCount + nutritionCount;
  const otherAssistanceCount = assistanceValues.filter((value) =>
    value !== '' &&
    !/kewirausaha|wirausaha|modal usaha|bantuan usaha|nutrisi|gizi|pemenuhan makanan/i.test(value)
  ).length;
  const assistanceMissingCount = assistanceValues.filter((value) => !value).length;

  const assistanceItems: DistributionItem[] = [
    { label: 'Bantuan kewirausahaan', count: entrepreneurshipCount },
    { label: 'Bantuan pemenuhan nutrisi', count: nutritionCount },
    ...(otherAssistanceCount > 0 ? [{ label: 'Kategori bantuan lainnya', count: otherAssistanceCount }] : []),
    ...(assistanceMissingCount > 0 ? [{ label: 'Belum diisi', count: assistanceMissingCount }] : []),
  ];
  const maxAgeCount = Math.max(...ageBrackets.map((item) => item.count), 1);
  const maxAssistanceCount = Math.max(...assistanceItems.map((item) => item.count), 1);

  const syncLabel = !googleSpreadsheetUrl
    ? 'Sumber belum dikonfigurasi'
    : liveSyncStatus === 'success'
      ? 'Tersambung · otomatis'
      : liveSyncStatus === 'error'
        ? 'Mencoba ulang otomatis'
        : liveSyncStatus === 'paused'
          ? 'Menunggu koneksi/izin'
          : 'Menghubungkan otomatis…';

  const renderBar = (
    item: DistributionItem,
    maxValue: number,
    variant: 'region' | 'age' | 'assistance',
    showPercent = false,
  ) => {
    const width = item.count > 0 ? Math.max((item.count / maxValue) * 100, 2) : 0;
    return (
      <div className="sipandu-chart-row" key={item.label}>
        <div className="sipandu-chart-row-label">
          <span>{item.label}</span>
          <strong>{item.count.toLocaleString('id-ID')}{showPercent ? ' · ' + formatPercent(item.count, totalPPKS) + '%' : ''}</strong>
        </div>
        <div
          className="sipandu-chart-track"
          role="progressbar"
          aria-label={item.label}
          aria-valuemin={0}
          aria-valuemax={maxValue}
          aria-valuenow={item.count}
        >
          <div
            className={'sipandu-chart-fill sipandu-chart-fill--' + variant}
            style={{ width: width + '%' }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="sipandu-dashboard-motion space-y-4 pb-24">
      <section className="sipandu-dashboard-sync sipandu-dashboard-panel">
        <div className="sipandu-dashboard-sync-main">
          <div className="sipandu-dashboard-icon sipandu-dashboard-icon--sync">
            <FileSpreadsheet className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="sipandu-dashboard-eyebrow-row">
              <span className="sipandu-dashboard-eyebrow">Google Spreadsheet Live Sync</span>
              <span className={'sipandu-sync-pill sipandu-sync-pill--' + liveSyncStatus}>
                <span className="sipandu-sync-dot" />
                {syncLabel}
              </span>
            </div>
            <h2 className="sipandu-dashboard-sync-title">
              {googleSpreadsheetName || (googleSpreadsheetUrl ? 'Spreadsheet sumber SIPANDU' : 'Spreadsheet belum dipilih')}
            </h2>
            <p className="sipandu-dashboard-muted">
              Pembaruan otomatis terakhir: {liveSyncLastUpdatedAt || 'Menunggu pembaruan pertama'}
              <span className="sipandu-dashboard-dot-separator">•</span>
              {totalPPKS.toLocaleString('id-ID')} PPKS pada aplikasi
            </p>
          </div>
        </div>
        {googleSpreadsheetUrl ? (
          <a
            href={googleSpreadsheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="sipandu-dashboard-link"
          >
            Buka Spreadsheet
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        ) : (
          <span className="sipandu-dashboard-muted sipandu-dashboard-source-hint">Sumber otomatis belum dikonfigurasi</span>
        )}
      </section>

      <section className="sipandu-dashboard-kpis" aria-label="Ringkasan PPKS">
        <article className="sipandu-dashboard-kpi sipandu-dashboard-panel">
          <div className="sipandu-dashboard-kpi-icon sipandu-dashboard-kpi-icon--blue"><UsersRound className="h-5 w-5" /></div>
          <div className="sipandu-dashboard-kpi-caption">Total PPKS terdaftar</div>
          <div className="sipandu-dashboard-kpi-value">{totalPPKS.toLocaleString('id-ID')}</div>
          <div className="sipandu-dashboard-kpi-foot">Data pada daftar aplikasi</div>
        </article>
        <article className="sipandu-dashboard-kpi sipandu-dashboard-panel">
          <div className="sipandu-dashboard-kpi-icon sipandu-dashboard-kpi-icon--sage"><Building2 className="h-5 w-5" /></div>
          <div className="sipandu-dashboard-kpi-caption">Wilayah terjangkau</div>
          <div className="sipandu-dashboard-kpi-value">{coveredDistrictCount}<span className="sipandu-dashboard-kpi-total">/33</span></div>
          <div className="sipandu-dashboard-kpi-foot">Kabupaten/kota dengan responden</div>
        </article>
        <article className="sipandu-dashboard-kpi sipandu-dashboard-panel">
          <div className="sipandu-dashboard-kpi-icon sipandu-dashboard-kpi-icon--teal"><HeartHandshake className="h-5 w-5" /></div>
          <div className="sipandu-dashboard-kpi-caption">Usia produktif · 26–45</div>
          <div className="sipandu-dashboard-kpi-value">{productiveAgePercent}<span className="sipandu-dashboard-kpi-total">%</span></div>
          <div className="sipandu-dashboard-kpi-foot">{productiveAgeCount.toLocaleString('id-ID')} responden</div>
        </article>
      </section>

      <section className="sipandu-dashboard-chart-grid" aria-label="Analitik PPKS">
        <article className="sipandu-dashboard-panel sipandu-dashboard-chart-card sipandu-dashboard-chart-card--region">
          <div className="sipandu-dashboard-card-heading">
            <div className="sipandu-dashboard-icon sipandu-dashboard-icon--blue"><ChartColumnIncreasing className="h-5 w-5" /></div>
            <div>
              <h3>PPKS berdasarkan wilayah</h3>
              <p>Distribusi responden pada 33 kabupaten/kota Sumatera Utara</p>
            </div>
          </div>
          <div className="sipandu-dashboard-region-summary">
            <div><strong>{recognizedRegionCount.toLocaleString('id-ID')}</strong><span>terpetakan</span></div>
            <div><strong>{unmatchedRegionCount.toLocaleString('id-ID')}</strong><span>belum cocok</span></div>
            <div><strong>{blankRegionCount.toLocaleString('id-ID')}</strong><span>belum diisi</span></div>
          </div>
          <div className="sipandu-dashboard-chart-list sipandu-dashboard-chart-list--regions">
            {cityCounts.map((item) => renderBar({ label: item.name, count: item.displayCount }, topRegionCount, 'region'))}
          </div>
        </article>

        <article className="sipandu-dashboard-panel sipandu-dashboard-chart-card">
          <div className="sipandu-dashboard-card-heading">
            <div className="sipandu-dashboard-icon sipandu-dashboard-icon--sage"><Clock3 className="h-5 w-5" /></div>
            <div>
              <h3>PPKS berdasarkan usia</h3>
              <p>Pengelompokan usia dari data responden</p>
            </div>
          </div>
          <div className="sipandu-dashboard-chart-list sipandu-dashboard-chart-list--ages">
            {ageBrackets.map((item) => renderBar(item, maxAgeCount, 'age', true))}
          </div>
          {ageMissingCount > 0 && (
            <div className="sipandu-dashboard-chart-note">
              {ageMissingCount.toLocaleString('id-ID')} responden belum memiliki data usia.
            </div>
          )}
        </article>

        <article className="sipandu-dashboard-panel sipandu-dashboard-chart-card">
          <div className="sipandu-dashboard-card-heading">
            <div className="sipandu-dashboard-icon sipandu-dashboard-icon--teal"><PieChart className="h-5 w-5" /></div>
            <div>
              <h3>PPKS berdasarkan jenis kelamin</h3>
              <p>Proporsi responden laki-laki dan perempuan</p>
            </div>
          </div>
          <div className="sipandu-dashboard-gender-layout">
            <div className="sipandu-dashboard-donut-wrap">
              <svg className="sipandu-dashboard-donut" viewBox="0 0 42 42" role="img" aria-label="Diagram jenis kelamin berdasarkan data responden">
                <circle className="sipandu-donut-track" cx="21" cy="21" r="15.915" fill="none" strokeWidth="5" />
                <circle className="sipandu-donut-male" cx="21" cy="21" r="15.915" fill="none" strokeWidth="5"
                  strokeDasharray={(totalPPKS > 0 ? maleCount / totalPPKS * 100 : 0) + ' ' + 100} strokeDashoffset="0" />
                <circle className="sipandu-donut-female" cx="21" cy="21" r="15.915" fill="none" strokeWidth="5"
                  strokeDasharray={(totalPPKS > 0 ? femaleCount / totalPPKS * 100 : 0) + ' ' + 100}
                  strokeDashoffset={-(totalPPKS > 0 ? maleCount / totalPPKS * 100 : 0)} />
              </svg>
              <div className="sipandu-dashboard-donut-center">
                <strong>{totalPPKS.toLocaleString('id-ID')}</strong>
                <span>responden</span>
              </div>
            </div>
            <div className="sipandu-dashboard-legend">
              <div className="sipandu-dashboard-legend-item">
                <span className="sipandu-dashboard-legend-dot sipandu-dashboard-legend-dot--male" />
                <div><strong>Laki-laki</strong><span>{maleCount.toLocaleString('id-ID')} · {formatPercent(maleCount, totalPPKS)}%</span></div>
              </div>
              <div className="sipandu-dashboard-legend-item">
                <span className="sipandu-dashboard-legend-dot sipandu-dashboard-legend-dot--female" />
                <div><strong>Perempuan</strong><span>{femaleCount.toLocaleString('id-ID')} · {formatPercent(femaleCount, totalPPKS)}%</span></div>
              </div>
              {genderUnknownCount > 0 && (
                <div className="sipandu-dashboard-legend-item">
                  <span className="sipandu-dashboard-legend-dot sipandu-dashboard-legend-dot--unknown" />
                  <div><strong>Belum terklasifikasi</strong><span>{genderUnknownCount.toLocaleString('id-ID')}</span></div>
                </div>
              )}
            </div>
          </div>
          {totalPPKS === 0 && <div className="sipandu-dashboard-chart-note">Belum ada data responden untuk ditampilkan.</div>}
        </article>

        <article className="sipandu-dashboard-panel sipandu-dashboard-chart-card">
          <div className="sipandu-dashboard-card-heading">
            <div className="sipandu-dashboard-icon sipandu-dashboard-icon--sage"><HeartHandshake className="h-5 w-5" /></div>
            <div>
              <h3>PPKS berdasarkan jenis bantuan</h3>
              <p>Kebutuhan bantuan yang tercatat pada formulir tahap awal</p>
            </div>
          </div>
          <div className="sipandu-dashboard-assistance-callout">
            <div className="sipandu-dashboard-assistance-callout-icon"><BriefcaseBusiness className="h-4 w-4" /></div>
            <div><strong>{entrepreneurshipCount.toLocaleString('id-ID')}</strong><span>Bantuan kewirausahaan</span></div>
            <div className="sipandu-dashboard-assistance-callout-icon"><Utensils className="h-4 w-4" /></div>
            <div><strong>{nutritionCount.toLocaleString('id-ID')}</strong><span>Bantuan nutrisi</span></div>
          </div>
          <div className="sipandu-dashboard-chart-list sipandu-dashboard-chart-list--assistance">
            {assistanceItems.map((item) => renderBar(item, maxAssistanceCount, 'assistance', true))}
          </div>
          {assistanceItems.length === 0 && (
            <div className="sipandu-dashboard-empty"><CircleHelp className="h-5 w-5" />Belum ada data jenis bantuan.</div>
          )}
        </article>
      </section>

      <footer className="sipandu-dashboard-footer">
        <span><UserRound className="h-3.5 w-3.5" /> Analitik diperbarui mengikuti data PPKS pada aplikasi.</span>
        <span>Jumlah dan persentase tidak menggunakan data contoh.</span>
      </footer>
    </div>
  );
};
