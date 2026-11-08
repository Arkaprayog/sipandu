import React, { useMemo, useState } from 'react';
import { CalendarDays, ClipboardList, Footprints, Plus, Search, ShieldCheck, UserRound, X } from 'lucide-react';
import type { FieldVisitRecord, FieldVisitType, PPKSRecord } from '../types';

interface Props {
  ppksList: PPKSRecord[];
  visits: FieldVisitRecord[];
  currentUserUid: string;
  currentUserRole: string;
  error: string;
  onCreateVisit: (input: Omit<FieldVisitRecord, 'id' | 'createdByUid' | 'createdAt'>) => Promise<void>;
}

const visitTypes: { value: FieldVisitType; label: string }[] = [
  { value: 'kunjungan-rumah', label: 'Kunjungan rumah' },
  { value: 'kunjungan-faskes', label: 'Kunjungan fasilitas kesehatan' },
  { value: 'pendampingan-sosial', label: 'Pendampingan sosial' },
  { value: 'monitoring-bantuan', label: 'Monitoring bantuan' },
  { value: 'koordinasi-rujukan', label: 'Koordinasi rujukan' },
];
const outcomes = [
  { value: 'selesai', label: 'Selesai' },
  { value: 'perlu-tindak-lanjut', label: 'Perlu tindak lanjut' },
  { value: 'tidak-bertemu', label: 'Tidak bertemu' },
  { value: 'dijadwalkan-ulang', label: 'Dijadwalkan ulang' },
] as const;
const localToday = () => {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
};

export const FieldAssistanceView: React.FC<Props> = ({ ppksList, visits, currentUserUid, currentUserRole, error, onCreateVisit }) => {
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [formError, setFormError] = useState('');
  const [ppksId, setPpksId] = useState('');
  const [visitDate, setVisitDate] = useState(localToday);
  const [visitType, setVisitType] = useState<FieldVisitType>('pendampingan-sosial');
  const [outcome, setOutcome] = useState<typeof outcomes[number]['value']>('selesai');
  const [summary, setSummary] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [followUpAt, setFollowUpAt] = useState('');
  const [assignedToUid, setAssignedToUid] = useState(currentUserUid);
  const isManager = currentUserRole === 'owner' || currentUserRole === 'supervisor';
  const nameById = useMemo(() => new Map(ppksList.map((item) => [item.id, item.namaLengkap])), [ppksList]);
  const filteredVisits = visits.filter((visit) => {
    const query = search.trim().toLocaleLowerCase('id-ID');
    return !query || (nameById.get(visit.ppksId) || visit.ppksId).toLocaleLowerCase('id-ID').includes(query) ||
      visit.visitType.toLocaleLowerCase('id-ID').includes(query) || visit.outcome.toLocaleLowerCase('id-ID').includes(query);
  });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    setNotice('');
    try {
      await onCreateVisit({
        ppksId, visitDate, visitType, outcome, summary, nextAction, followUpAt,
        assignedToUid: isManager ? assignedToUid : currentUserUid,
      });
      setNotice('Catatan kunjungan berhasil disimpan dan dikunci sebagai riwayat.');
      setPpksId('');
      setSummary('');
      setNextAction('');
      setFollowUpAt('');
      setShowForm(false);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 pb-28 text-white">
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-emerald-950/70 via-[#11251e] to-slate-950/80 p-4 shadow-xl sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200"><Footprints className="h-4 w-4" /> FIELD ASSISTANCE</span>
            <h2 className="mt-2 text-xl font-black tracking-tight sm:text-2xl">Pendampingan Lapangan</h2>
            <p className="mt-2 max-w-2xl text-xs leading-relaxed text-slate-300">Catat kunjungan, hasil pendampingan, dan tindak lanjut PPKS. Riwayat disimpan terpisah dari roster utama dan tidak merekam lokasi GPS.</p>
          </div>
          <button type="button" onClick={() => { setShowForm((value) => !value); setFormError(''); }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-200/20 bg-emerald-400/15 px-4 py-2 text-xs font-bold text-emerald-100 hover:bg-emerald-400/25"><Plus className="h-4 w-4" /> Catat kunjungan</button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3"><ClipboardList className="h-4 w-4 text-emerald-200" /><strong className="mt-2 block text-2xl font-black tabular-nums">{visits.length.toLocaleString('id-ID')}</strong><span className="text-[10px] text-slate-300">Riwayat yang dapat diakses</span></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3"><CalendarDays className="h-4 w-4 text-sky-200" /><strong className="mt-2 block text-2xl font-black tabular-nums">{visits.filter((item) => item.followUpAt && item.followUpAt >= localToday()).length.toLocaleString('id-ID')}</strong><span className="text-[10px] text-slate-300">Tindak lanjut mendatang</span></div>
          <div className="col-span-2 rounded-2xl border border-white/10 bg-white/[0.06] p-3 sm:col-span-1"><ShieldCheck className="h-4 w-4 text-violet-200" /><strong className="mt-2 block text-sm font-black">{isManager ? 'Pemantauan tim' : 'Penugasan pribadi'}</strong><span className="text-[10px] text-slate-300">{isManager ? 'Akses sesuai peran supervisor/owner' : 'Hanya catatan yang ditugaskan ke akun ini'}</span></div>
        </div>
      </section>

      {error && <p role="alert" className="rounded-xl border border-rose-300/20 bg-rose-950/30 p-3 text-xs text-rose-100">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-300/20 bg-emerald-950/30 p-3 text-xs text-emerald-100">{notice}</p>}

      {showForm && (
        <form onSubmit={submit} className="space-y-3 rounded-3xl border border-emerald-200/20 bg-slate-950/55 p-4 shadow-xl sm:p-5">
          <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-extrabold">Catatan kunjungan baru</h3><button type="button" onClick={() => setShowForm(false)} aria-label="Tutup formulir" className="rounded-lg p-2 text-slate-300 hover:bg-white/10"><X className="h-4 w-4" /></button></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-[11px] text-slate-300">PPKS
              <select required value={ppksId} onChange={(event) => setPpksId(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-900 px-3 text-xs text-white"><option value="">Pilih PPKS</option>{ppksList.map((item) => <option key={item.id} value={item.id}>{item.namaLengkap} · {item.kotaDomisili}</option>)}</select>
            </label>
            <label className="space-y-1 text-[11px] text-slate-300">Tanggal kunjungan
              <input required type="date" value={visitDate} onChange={(event) => setVisitDate(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-900 px-3 text-xs text-white" />
            </label>
            <label className="space-y-1 text-[11px] text-slate-300">Jenis kunjungan
              <select value={visitType} onChange={(event) => setVisitType(event.target.value as FieldVisitType)} className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-900 px-3 text-xs text-white">{visitTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
            </label>
            <label className="space-y-1 text-[11px] text-slate-300">Hasil kunjungan
              <select value={outcome} onChange={(event) => setOutcome(event.target.value as typeof outcome)} className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-900 px-3 text-xs text-white">{outcomes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
            </label>
            <label className="space-y-1 text-[11px] text-slate-300 sm:col-span-2">Ringkasan pendampingan
              <textarea required minLength={3} maxLength={3000} rows={3} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Tuliskan kegiatan dan hasil secara faktual. Hindari diagnosis atau informasi sensitif yang tidak diperlukan." className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs text-white placeholder:text-slate-500" />
            </label>
            <label className="space-y-1 text-[11px] text-slate-300 sm:col-span-2">Rencana tindak lanjut
              <textarea maxLength={1200} rows={2} value={nextAction} onChange={(event) => setNextAction(event.target.value)} placeholder="Langkah berikutnya (jika ada)" className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs text-white placeholder:text-slate-500" />
            </label>
            <label className="space-y-1 text-[11px] text-slate-300">Tanggal tindak lanjut
              <input type="date" value={followUpAt} onChange={(event) => setFollowUpAt(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-900 px-3 text-xs text-white" />
            </label>
            {isManager ? <label className="space-y-1 text-[11px] text-slate-300">UID pendamping yang ditugaskan
              <input required value={assignedToUid} onChange={(event) => setAssignedToUid(event.target.value)} maxLength={128} placeholder="UID akun pendamping" className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-900 px-3 text-xs text-white placeholder:text-slate-500" />
            </label> : <div className="flex items-end text-[10px] text-slate-400"><UserRound className="mr-2 h-4 w-4" /> Kunjungan ditugaskan otomatis ke akun Anda.</div>}
          </div>
          {formError && <p role="alert" className="rounded-lg bg-rose-950/50 p-2 text-xs text-rose-100">{formError}</p>}
          <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-white/10 px-4 py-2 text-xs text-slate-300">Batal</button><button disabled={saving} type="submit" className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-emerald-950 disabled:opacity-50">{saving ? 'Menyimpan…' : 'Simpan riwayat'}</button></div>
        </form>
      )}

      <section className="rounded-3xl border border-white/10 bg-slate-950/35 p-3 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-extrabold">Riwayat kunjungan</h3><p className="mt-1 text-[10px] text-slate-400">Catatan bersifat append-only untuk menjaga jejak audit.</p></div><span className="text-[10px] text-slate-400">{filteredVisits.length} catatan</span></div>
        <label className="mb-3 flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3"><Search className="h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari PPKS atau jenis kunjungan…" className="w-full min-w-0 bg-transparent text-xs text-white outline-none placeholder:text-slate-500" aria-label="Cari riwayat kunjungan" /></label>
        <div className="space-y-2">{filteredVisits.map((visit) => (
          <article key={visit.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-3">
            <div className="flex flex-wrap items-start justify-between gap-2"><div><strong className="text-xs text-slate-100">{nameById.get(visit.ppksId) || 'PPKS tidak ada di roster aktif'}</strong><p className="mt-1 text-[10px] text-slate-400">{visitTypes.find((item) => item.value === visit.visitType)?.label || visit.visitType} · {visit.visitDate}</p></div><span className="rounded-full border border-emerald-200/15 bg-emerald-400/10 px-2 py-1 text-[9px] text-emerald-100">{outcomes.find((item) => item.value === visit.outcome)?.label || visit.outcome}</span></div>
            <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-300">{visit.summary}</p>
            {visit.nextAction && <p className="mt-2 text-[10px] text-sky-200">Tindak lanjut: {visit.nextAction}{visit.followUpAt ? ' · ' + visit.followUpAt : ''}</p>}
            <p className="mt-2 text-[9px] text-slate-500">Ditugaskan ke UID: {visit.assignedToUid} · Catatan terkunci</p>
          </article>
        ))}{filteredVisits.length === 0 && <p className="py-8 text-center text-xs text-slate-400">Belum ada catatan kunjungan yang dapat ditampilkan.</p>}</div>
      </section>
      <p className="rounded-2xl border border-amber-200/15 bg-amber-950/20 p-3 text-[10px] leading-relaxed text-amber-100/80">Privasi: jangan mencatat NIK, alamat lengkap, data medis, diagnosis, status HIV, atau informasi sensitif yang tidak diperlukan dalam ringkasan. Akses kunjungan mengikuti UID penugasan.</p>
    </div>
  );
};
