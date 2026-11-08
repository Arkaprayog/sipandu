import React, { useMemo, useState } from 'react';
import {
  Activity,
  Apple,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Download,
  FileClock,
  HeartHandshake,
  History,
  Search,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react';
import type {
  AssistanceServiceStatus,
  PPKSFollowUpReason,
  PPKSRecord,
  PPKSServiceEvent,
  PPKSServiceEventType,
  PPKSServiceStatus,
  PPKSServiceUpdateInput,
  PsychosocialTherapyStatus,
} from '../types';
import {
  calculatePPKSServiceMetrics,
  getInitialPPKSServiceStatus,
  isAssistancePending,
  isFollowUpRequired,
  resolvePPKSServiceStatus,
} from '../lib/serviceManagement';
import { fetchPPKSServiceEvents } from '../lib/firebase';

interface ServiceCenterViewProps {
  ppksList: PPKSRecord[];
  serviceStatuses: PPKSServiceStatus[];
  serviceStatusLoading: boolean;
  currentUserUid: string;
  onSaveUpdate: (input: PPKSServiceUpdateInput) => Promise<void>;
}

type ServiceFilter = 'semua' | 'nutrisi' | 'kewirausahaan' | 'terapi' | 'tindak-lanjut';

const PAGE_SIZE = 16;
const ASSISTANCE_OPTIONS: Array<{ value: AssistanceServiceStatus; label: string }> = [
  { value: 'belum-diverifikasi', label: 'Belum diverifikasi' },
  { value: 'dibutuhkan', label: 'Dibutuhkan' },
  { value: 'dalam-proses', label: 'Dalam proses' },
  { value: 'diterima', label: 'Telah diterima' },
  { value: 'tidak-dibutuhkan', label: 'Tidak dibutuhkan' },
];
const THERAPY_OPTIONS: Array<{ value: PsychosocialTherapyStatus; label: string }> = [
  { value: 'belum-dimulai', label: 'Belum dimulai' },
  { value: 'terjadwal', label: 'Terjadwal' },
  { value: 'aktif', label: 'Berjalan' },
  { value: 'selesai', label: 'Selesai' },
];
const FOLLOW_UP_OPTIONS: Array<{ value: Exclude<PPKSFollowUpReason, ''>; label: string }> = [
  { value: 'konfirmasi-penerimaan-bantuan', label: 'Konfirmasi penerimaan bantuan' },
  { value: 'penjadwalan-penyaluran', label: 'Penjadwalan penyaluran' },
  { value: 'monitoring-pendampingan', label: 'Monitoring pendampingan' },
  { value: 'evaluasi-terapi', label: 'Evaluasi terapi psikososial' },
  { value: 'verifikasi-dokumen', label: 'Verifikasi dokumen' },
  { value: 'lainnya', label: 'Lainnya' },
];

const dateToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });

const assistanceLabel = (value: AssistanceServiceStatus) =>
  ASSISTANCE_OPTIONS.find((item) => item.value === value)?.label || 'Belum diverifikasi';
const therapyLabel = (value: PsychosocialTherapyStatus) =>
  THERAPY_OPTIONS.find((item) => item.value === value)?.label || 'Belum dimulai';
const followUpLabel = (value: PPKSFollowUpReason) =>
  FOLLOW_UP_OPTIONS.find((item) => item.value === value)?.label || 'Belum ditentukan';

function statusTone(value: string) {
  if (value === 'diterima' || value === 'selesai') return 'sipandu-service-status--success';
  if (value === 'dibutuhkan' || value === 'terjadwal' || value === 'aktif') return 'sipandu-service-status--warning';
  if (value === 'dalam-proses') return 'sipandu-service-status--progress';
  return 'sipandu-service-status--neutral';
}

function csvCell(value: unknown): string {
  const text = String(value ?? '');
  return '"' + text.replace(/"/g, '""') + '"';
}

export const ServiceCenterView: React.FC<ServiceCenterViewProps> = ({
  ppksList,
  serviceStatuses,
  serviceStatusLoading,
  currentUserUid,
  onSaveUpdate,
}) => {
  const [searchText, setSearchText] = useState('');
  const [filter, setFilter] = useState<ServiceFilter>('semua');
  const [selectedCity, setSelectedCity] = useState('semua');
  const [page, setPage] = useState(0);
  const [editingRecord, setEditingRecord] = useState<PPKSRecord | null>(null);
  const [eventType, setEventType] = useState<PPKSServiceEventType>('nutrition-assistance');
  const [selectedStatus, setSelectedStatus] = useState<AssistanceServiceStatus | PsychosocialTherapyStatus>('belum-diverifikasi');
  const [serviceDate, setServiceDate] = useState(dateToday());
  const [followUpAt, setFollowUpAt] = useState('');
  const [followUpReason, setFollowUpReason] = useState<PPKSFollowUpReason>('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [historyRecord, setHistoryRecord] = useState<PPKSRecord | null>(null);
  const [historyEvents, setHistoryEvents] = useState<PPKSServiceEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  const statusById = useMemo(() => new Map(serviceStatuses.map((status) => [status.ppksId, status])), [serviceStatuses]);
  const resolvedStatuses = useMemo(() => new Map(
    ppksList.map((record) => [record.id, resolvePPKSServiceStatus(record, statusById.get(record.id))])
  ), [ppksList, statusById]);
  const metrics = useMemo(() => calculatePPKSServiceMetrics(ppksList, serviceStatuses), [ppksList, serviceStatuses]);
  const cities = useMemo(() => [...new Set(ppksList.map((record) => String(record.kotaDomisili || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'id')), [ppksList]);

  const filteredRecords = useMemo(() => {
    const needle = searchText.trim().toLocaleLowerCase('id-ID');
    return ppksList.filter((record) => {
      const status = resolvedStatuses.get(record.id) || getInitialPPKSServiceStatus(record);
      const textMatch = !needle || [record.namaLengkap, record.kotaDomisili, record.id]
        .some((value) => String(value || '').toLocaleLowerCase('id-ID').includes(needle));
      const cityMatch = selectedCity === 'semua' || String(record.kotaDomisili || '').trim() === selectedCity;
      const statusMatch =
        filter === 'semua' ||
        (filter === 'nutrisi' && isAssistancePending(status.nutritionStatus)) ||
        (filter === 'kewirausahaan' && isAssistancePending(status.entrepreneurshipStatus)) ||
        (filter === 'terapi' && ['terjadwal', 'aktif', 'selesai'].includes(status.psychosocialStatus)) ||
        (filter === 'tindak-lanjut' && isFollowUpRequired(status));
      return textMatch && cityMatch && statusMatch;
    }).sort((a, b) => a.namaLengkap.localeCompare(b.namaLengkap, 'id'));
  }, [ppksList, resolvedStatuses, searchText, selectedCity, filter]);

  const pageCount = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleRecords = filteredRecords.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const openEditor = (record: PPKSRecord, nextType: PPKSServiceEventType = 'nutrition-assistance') => {
    const status = resolvedStatuses.get(record.id) || getInitialPPKSServiceStatus(record);
    setEditingRecord(record);
    setEventType(nextType);
    setSelectedStatus(
      nextType === 'nutrition-assistance' ? status.nutritionStatus :
      nextType === 'entrepreneurship-assistance' ? status.entrepreneurshipStatus :
      status.psychosocialStatus
    );
    setServiceDate(dateToday());
    setFollowUpAt(status.followUpAt || '');
    setFollowUpReason(status.followUpReason || '');
    setFormError('');
  };

  const handleTypeChange = (nextType: PPKSServiceEventType) => {
    if (!editingRecord) return;
    const status = resolvedStatuses.get(editingRecord.id) || getInitialPPKSServiceStatus(editingRecord);
    setEventType(nextType);
    setSelectedStatus(
      nextType === 'nutrition-assistance' ? status.nutritionStatus :
      nextType === 'entrepreneurship-assistance' ? status.entrepreneurshipStatus :
      status.psychosocialStatus
    );
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingRecord) return;
    const requiresDate = selectedStatus === 'diterima' || selectedStatus === 'selesai';
    if (requiresDate && !serviceDate) {
      setFormError('Tanggal layanan wajib diisi untuk status diterima atau selesai.');
      return;
    }
    if (followUpAt && !followUpReason) {
      setFormError('Pilih alasan tindak lanjut agar jadwal dapat dipahami petugas berikutnya.');
      return;
    }
    const initialStatus = resolvedStatuses.get(editingRecord.id) || getInitialPPKSServiceStatus(editingRecord);
    setSaving(true);
    setFormError('');
    try {
      await onSaveUpdate({
        ppksId: editingRecord.id,
        eventType,
        status: selectedStatus,
        serviceDate,
        followUpAt,
        followUpReason,
        initialStatus,
      });
      setEditingRecord(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const showHistory = async (record: PPKSRecord) => {
    setHistoryRecord(record);
    setHistoryEvents([]);
    setHistoryError('');
    setHistoryLoading(true);
    try {
      const events = await fetchPPKSServiceEvents(record.id);
      setHistoryEvents(events);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : String(error));
    } finally {
      setHistoryLoading(false);
    }
  };

  const exportSummary = () => {
    const rows = [
      ['Laporan Monitoring Layanan SIPANDU', dateToday()],
      ['Indikator', 'Jumlah PPKS'],
      ['Total PPKS pada daftar aktif', metrics.total],
      ['Membutuhkan bantuan nutrisi / dalam proses', metrics.nutritionNeeds],
      ['Sudah menerima bantuan nutrisi', metrics.nutritionReceived],
      ['Status bantuan nutrisi belum diverifikasi', metrics.nutritionUnverified],
      ['Membutuhkan bantuan kewirausahaan / dalam proses', metrics.entrepreneurshipNeeds],
      ['Sudah menerima bantuan kewirausahaan', metrics.entrepreneurshipReceived],
      ['Status bantuan kewirausahaan belum diverifikasi', metrics.entrepreneurshipUnverified],
      ['Terapi psikososial terjadwal', metrics.therapyScheduled],
      ['Terapi psikososial aktif', metrics.therapyActive],
      ['Terapi psikososial selesai / memiliki sesi tercatat', metrics.therapyCompleted],
      ['Membutuhkan tindak lanjut', metrics.followUpRequired],
      ['Jadwal tindak lanjut tersimpan', metrics.followUpScheduled],
    ];
    const csv = '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'SIPANDU-Rekap-Layanan-' + dateToday() + '.csv';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const formatDate = (value: string) => {
    if (!value) return 'Belum dicatat';
    const date = new Date(value.length === 10 ? value + 'T00:00:00' : value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('id-ID', { dateStyle: 'medium' });
  };

  const typeLabel = (type: PPKSServiceEventType) =>
    type === 'nutrition-assistance' ? 'Bantuan nutrisi' :
    type === 'entrepreneurship-assistance' ? 'Bantuan kewirausahaan' : 'Terapi psikososial';

  return (
    <div className="sipandu-service-center space-y-4 pb-28">
      <section className="sipandu-service-hero">
        <div className="sipandu-service-hero-copy">
          <span className="sipandu-service-eyebrow"><ShieldCheck className="h-3.5 w-3.5" /> SERVICE CENTER</span>
          <h2>Pusat Layanan & Pendampingan PPKS</h2>
          <p>Pantau kebutuhan bantuan, terapi psikososial, dan tindak lanjut berdasarkan catatan layanan yang benar-benar tersimpan.</p>
        </div>
        <button type="button" className="sipandu-service-export" onClick={exportSummary}>
          <Download className="h-4 w-4" /> Ekspor rekap CSV
        </button>
      </section>

      <section className="sipandu-service-kpis" aria-label="Ringkasan layanan">
        <article className="sipandu-service-kpi"><span><UserRound className="h-4 w-4"/></span><small>Total PPKS</small><strong>{metrics.total.toLocaleString('id-ID')}</strong><em>Daftar PPKS aktif</em></article>
        <article className="sipandu-service-kpi"><span><Apple className="h-4 w-4"/></span><small>Butuh bantuan nutrisi</small><strong>{metrics.nutritionNeeds.toLocaleString('id-ID')}</strong><em>{metrics.nutritionReceived} telah tercatat menerima</em></article>
        <article className="sipandu-service-kpi"><span><BriefcaseBusiness className="h-4 w-4"/></span><small>Butuh kewirausahaan</small><strong>{metrics.entrepreneurshipNeeds.toLocaleString('id-ID')}</strong><em>{metrics.entrepreneurshipReceived} telah tercatat menerima</em></article>
        <article className="sipandu-service-kpi"><span><CalendarClock className="h-4 w-4"/></span><small>Perlu tindak lanjut</small><strong>{metrics.followUpRequired.toLocaleString('id-ID')}</strong><em>{metrics.followUpScheduled} memiliki jadwal tercatat</em></article>
      </section>

      <section className="sipandu-service-workspace">
        <div className="sipandu-service-section-heading">
          <div><h3>Daftar layanan per PPKS</h3><p>Status bantuan nutrisi dan kewirausahaan dipantau terpisah.</p></div>
          <span className="sipandu-service-count">{filteredRecords.length.toLocaleString('id-ID')} PPKS</span>
        </div>

        <div className="sipandu-service-filters">
          <label className="sipandu-service-search"><Search className="h-4 w-4"/><input value={searchText} onChange={(event) => { setSearchText(event.target.value); setPage(0); }} placeholder="Cari nama, ID, atau kabupaten/kota" /></label>
          <select aria-label="Filter layanan" value={filter} onChange={(event) => { setFilter(event.target.value as ServiceFilter); setPage(0); }}>
            <option value="semua">Semua layanan</option>
            <option value="nutrisi">Butuh bantuan nutrisi</option>
            <option value="kewirausahaan">Butuh kewirausahaan</option>
            <option value="terapi">Terapi psikososial</option>
            <option value="tindak-lanjut">Perlu tindak lanjut</option>
          </select>
          <select aria-label="Filter wilayah" value={selectedCity} onChange={(event) => { setSelectedCity(event.target.value); setPage(0); }}>
            <option value="semua">Semua wilayah</option>
            {cities.map((city) => <option key={city} value={city}>{city}</option>)}
          </select>
        </div>

        {serviceStatusLoading && <p className="sipandu-service-loading">Menyinkronkan status layanan dari Firestore…</p>}
        {!serviceStatusLoading && serviceStatuses.length === 0 && (
          <div className="sipandu-service-info"><Activity className="h-4 w-4"/> Belum ada riwayat perubahan layanan yang dicatat. Kebutuhan awal diturunkan hanya dari permintaan bantuan yang sudah tercatat pada data PPKS.</div>
        )}

        <div className="sipandu-service-list">
          {visibleRecords.map((record) => {
            const status = resolvedStatuses.get(record.id) || getInitialPPKSServiceStatus(record);
            return (
              <article className="sipandu-service-record" key={record.id}>
                <div className="sipandu-service-record-main">
                  <div className="sipandu-service-avatar"><UserRound className="h-5 w-5"/></div>
                  <div className="min-w-0">
                    <h4>{record.namaLengkap || 'Nama belum tersedia'}</h4>
                    <p>{record.kotaDomisili || 'Wilayah belum dicatat'} <span>·</span> ID {record.id}</p>
                    <div className="sipandu-service-statuses">
                      <span className={'sipandu-service-status ' + statusTone(status.nutritionStatus)}><Apple className="h-3 w-3"/> Nutrisi: {assistanceLabel(status.nutritionStatus)}</span>
                      <span className={'sipandu-service-status ' + statusTone(status.entrepreneurshipStatus)}><BriefcaseBusiness className="h-3 w-3"/> Kewirausahaan: {assistanceLabel(status.entrepreneurshipStatus)}</span>
                      <span className={'sipandu-service-status ' + statusTone(status.psychosocialStatus)}><HeartHandshake className="h-3 w-3"/> Terapi: {therapyLabel(status.psychosocialStatus)}</span>
                    </div>
                    <p className="sipandu-service-followup-caption">
                      {status.followUpAt ? 'Tindak lanjut: ' + formatDate(status.followUpAt) + ' · ' + followUpLabel(status.followUpReason) : isFollowUpRequired(status) ? 'Memerlukan pemantauan/tindak lanjut' : 'Belum ada tindak lanjut terjadwal'}
                    </p>
                  </div>
                </div>
                <div className="sipandu-service-record-actions">
                  <button type="button" onClick={() => void showHistory(record)}><History className="h-4 w-4"/> Riwayat</button>
                  <button type="button" className="sipandu-service-primary" onClick={() => openEditor(record)}><ClipboardList className="h-4 w-4"/> Perbarui</button>
                </div>
              </article>
            );
          })}
          {visibleRecords.length === 0 && (
            <div className="sipandu-service-empty"><Search className="h-6 w-6"/><strong>PPKS tidak ditemukan</strong><span>Coba ubah kata pencarian atau filter layanan.</span></div>
          )}
        </div>

        <div className="sipandu-service-pagination">
          <span>Halaman {currentPage + 1} dari {pageCount}</span>
          <div>
            <button type="button" disabled={currentPage === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>Sebelumnya</button>
            <button type="button" disabled={currentPage >= pageCount - 1} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}>Berikutnya</button>
          </div>
        </div>
      </section>

      {editingRecord && (
        <div className="sipandu-service-modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget && !saving) setEditingRecord(null); }}>
          <section className="sipandu-service-modal" role="dialog" aria-modal="true" aria-labelledby="sipandu-service-modal-title">
            <div className="sipandu-service-modal-heading">
              <div><span>PEMBARUAN CATATAN LAYANAN</span><h3 id="sipandu-service-modal-title">{editingRecord.namaLengkap}</h3><p>{editingRecord.kotaDomisili} · ID {editingRecord.id}</p></div>
              <button type="button" aria-label="Tutup" disabled={saving} onClick={() => setEditingRecord(null)}><X className="h-5 w-5"/></button>
            </div>
            <form onSubmit={handleSubmit} className="sipandu-service-form">
              <label>Jenis layanan
                <select value={eventType} onChange={(event) => handleTypeChange(event.target.value as PPKSServiceEventType)}>
                  <option value="nutrition-assistance">Bantuan pemenuhan nutrisi</option>
                  <option value="entrepreneurship-assistance">Bantuan kewirausahaan</option>
                  <option value="psychosocial-therapy">Terapi psikososial</option>
                </select>
              </label>
              <label>Status layanan
                <select value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value as AssistanceServiceStatus | PsychosocialTherapyStatus)}>
                  {(eventType === 'psychosocial-therapy' ? THERAPY_OPTIONS : ASSISTANCE_OPTIONS).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label>Tanggal layanan
                <input type="date" value={serviceDate} onChange={(event) => setServiceDate(event.target.value)} />
              </label>
              <div className="sipandu-service-form-note">Catat status dan tanggal layanan saja. Jangan menulis NIK, diagnosis, status HIV, regimen obat, atau rincian medis pada catatan operasional ini.</div>
              <div className="sipandu-service-form-divider"/>
              <h4>Jadwal tindak lanjut</h4>
              <label>Tanggal tindak lanjut (opsional)
                <input type="date" value={followUpAt} onChange={(event) => setFollowUpAt(event.target.value)} min={dateToday()} />
              </label>
              <label>Alasan tindak lanjut
                <select value={followUpReason} onChange={(event) => setFollowUpReason(event.target.value as PPKSFollowUpReason)} disabled={!followUpAt}>
                  <option value="">Pilih alasan</option>
                  {FOLLOW_UP_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
                </select>
              </label>
              {formError && <p className="sipandu-service-error" role="alert">{formError}</p>}
              <div className="sipandu-service-form-actions">
                <button type="button" disabled={saving} onClick={() => setEditingRecord(null)}>Batal</button>
                <button type="submit" className="sipandu-service-primary" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan pembaruan'}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {historyRecord && (
        <div className="sipandu-service-modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setHistoryRecord(null); }}>
          <section className="sipandu-service-modal" role="dialog" aria-modal="true" aria-labelledby="sipandu-service-history-title">
            <div className="sipandu-service-modal-heading">
              <div><span>RIWAYAT AKTIVITAS</span><h3 id="sipandu-service-history-title">{historyRecord.namaLengkap}</h3><p>{historyRecord.kotaDomisili} · ID {historyRecord.id}</p></div>
              <button type="button" aria-label="Tutup riwayat" onClick={() => setHistoryRecord(null)}><X className="h-5 w-5"/></button>
            </div>
            <div className="sipandu-service-history">
              {historyLoading && <p>Memuat riwayat layanan…</p>}
              {historyError && <p className="sipandu-service-error">{historyError}</p>}
              {!historyLoading && !historyError && historyEvents.length === 0 && <div className="sipandu-service-empty"><FileClock className="h-6 w-6"/><strong>Belum ada riwayat layanan</strong><span>Setiap pembaruan yang disimpan akan tercatat di sini.</span></div>}
              {historyEvents.map((item) => (
                <article key={item.id} className="sipandu-service-history-item">
                  <span className="sipandu-service-history-icon"><CheckCircle2 className="h-4 w-4"/></span>
                  <div><strong>{typeLabel(item.eventType)}</strong><p>{item.status.replace(/-/g, ' ')}</p><small>Tanggal layanan: {formatDate(item.serviceDate)} · Dicatat: {formatDate(item.createdAt)}</small>{item.followUpAt && <small>Tindak lanjut: {formatDate(item.followUpAt)} · {followUpLabel(item.followUpReason)}</small>}</div>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}

      <footer className="sipandu-service-footer">
        <span><ShieldCheck className="h-3.5 w-3.5"/> Catatan layanan dibatasi untuk akun staf SIPANDU dan memiliki riwayat pencatatan.</span>
        <span>Penanggung jawab aktif: {currentUserUid ? 'akun terautentikasi' : 'belum tersedia'}</span>
      </footer>
    </div>
  );
};
