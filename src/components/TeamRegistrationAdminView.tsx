import React, { useCallback, useEffect, useState } from 'react';
import { auth } from '../lib/firebase';
import { TEAM_REGISTRATION_API } from '../lib/teamRegistration';
import { Check, RefreshCw, ShieldCheck, UserMinus, UserPlus, X } from 'lucide-react';

type PendingRegistration = {
  uid: string;
  email: string;
  name?: string;
  createdAt: number;
  status: 'pending_owner';
};

type RegistrationDelegate = {
  uid: string;
  email?: string;
  assignedAt?: number;
};

type ApiResult = {
  ok?: boolean;
  message?: string;
  items?: PendingRegistration[];
  delegates?: RegistrationDelegate[];
  emailNotificationSent?: boolean;
};

interface TeamRegistrationAdminViewProps {
  currentUserRole: string;
}

async function requestRegistrationApi(path: string, method: 'GET' | 'POST', body?: Record<string, unknown>): Promise<ApiResult> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sesi SIPANDU berakhir. Masuk kembali untuk melanjutkan.');
  const token = await user.getIdToken(true);
  const response = await fetch(TEAM_REGISTRATION_API + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(method === 'POST' ? { body: JSON.stringify(body || {}) } : {}),
  });
  const result = await response.json().catch(() => ({})) as ApiResult;
  if (!response.ok || !result.ok) throw new Error(result.message || 'Layanan persetujuan pendaftaran belum merespons.');
  return result;
}

export const TeamRegistrationAdminView: React.FC<TeamRegistrationAdminViewProps> = ({ currentUserRole }) => {
  const [items, setItems] = useState<PendingRegistration[]>([]);
  const [delegates, setDelegates] = useState<RegistrationDelegate[]>([]);
  const [supervisorUid, setSupervisorUid] = useState('');
  const [loading, setLoading] = useState(true);
  const [workingUid, setWorkingUid] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const isOwner = currentUserRole === 'owner';

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const pending = await requestRegistrationApi('/owner/pending', 'GET');
      setItems(pending.items || []);
      if (isOwner) {
        const delegated = await requestRegistrationApi('/owner/delegates', 'GET');
        setDelegates(delegated.delegates || []);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Data pendaftaran belum dapat dimuat.');
    } finally {
      setLoading(false);
    }
  }, [isOwner]);

  useEffect(() => { void refresh(); }, [refresh]);

  const decide = async (uid: string, decision: 'approve' | 'reject') => {
    const label = decision === 'approve' ? 'menyetujui' : 'menolak';
    if (!window.confirm(`Anda akan ${label} permohonan ini. Lanjutkan?`)) return;
    setWorkingUid(uid);
    setError('');
    setNotice('');
    try {
      const result = await requestRegistrationApi('/owner/' + decision, 'POST', { uid });
      setNotice(result.emailNotificationSent
        ? (decision === 'approve'
          ? 'Permohonan disetujui dan email pemberitahuan telah dikirim. Pendaftar akan menerima tautan verifikasi setelah masuk.'
          : 'Permohonan ditolak dan email pemberitahuan telah dikirim.')
        : (decision === 'approve'
          ? 'Permohonan disetujui. Email belum terkirim karena konfigurasi layanan email Resend belum lengkap.'
          : 'Permohonan ditolak. Email belum terkirim karena konfigurasi layanan email Resend belum lengkap.'));
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Keputusan belum berhasil disimpan.');
    } finally {
      setWorkingUid('');
    }
  };

  const setDelegate = async (enabled: boolean, uid = supervisorUid) => {
    const value = uid.trim();
    if (!value) {
      setError('Masukkan Firebase UID Supervisor terlebih dahulu.');
      return;
    }
    setWorkingUid(value);
    setError('');
    setNotice('');
    try {
      const result = await requestRegistrationApi('/owner/delegates', 'POST', { uid: value, enabled });
      setNotice(result.message || 'Kewenangan delegasi berhasil diperbarui.');
      setSupervisorUid('');
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Delegasi belum berhasil diperbarui.');
    } finally {
      setWorkingUid('');
    }
  };

  return (
    <section className="mx-auto w-full max-w-5xl space-y-5 text-white">
      <header className="rounded-2xl border border-emerald-400/25 bg-[#102416]/90 p-5 shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-emerald-200">
              <ShieldCheck className="h-5 w-5" />
              <span className="text-xs font-bold uppercase tracking-[0.16em]">Administrasi akses tim</span>
            </div>
            <h1 className="mt-2 text-2xl font-extrabold">Pendaftaran Tim SIPANDU</h1>
            <p className="mt-1 max-w-2xl text-sm text-emerald-50/75">Tinjau permohonan anggota baru sebelum akun memperoleh akses ke dashboard. Keputusan diverifikasi ulang oleh Worker.</p>
          </div>
          <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200/30 px-3 py-2 text-xs font-bold hover:bg-emerald-900/60 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Perbarui
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-amber-300/30 bg-amber-500/10 px-3 py-1.5 text-amber-100">{items.length} permohonan menunggu</span>
          <span className="rounded-full border border-emerald-300/20 bg-emerald-500/10 px-3 py-1.5 text-emerald-100">Akun lama tidak diubah</span>
        </div>
      </header>

      {error && <div role="alert" className="rounded-xl border border-rose-300/30 bg-rose-950/60 p-3 text-sm text-rose-100">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-300/30 bg-emerald-950/60 p-3 text-sm text-emerald-100">{notice}</div>}

      <div className="rounded-2xl border border-white/10 bg-[#0e1c12]/90 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Permohonan menunggu persetujuan</h2>
          <span className="text-xs text-emerald-100/70">Status: pending_owner</span>
        </div>
        {loading ? (
          <p className="py-8 text-center text-sm text-emerald-100/70">Memuat permohonan…</p>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm text-emerald-100/70">Belum ada permohonan yang menunggu persetujuan.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {items.map((item) => (
              <article key={item.uid} className="rounded-xl border border-emerald-100/15 bg-black/20 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold">{item.name || 'Nama belum tersedia'}</p>
                    <p className="break-all text-xs text-emerald-50/80">{item.email || 'Email tidak tersedia'}</p>
                    <p className="mt-1 break-all text-[11px] text-emerald-100/55">UID: {item.uid}</p>
                    <p className="mt-1 text-xs text-emerald-100/70">Diajukan: {item.createdAt ? new Date(item.createdAt).toLocaleString('id-ID') : 'Tidak diketahui'}</p>
                  </div>
                  <span className="rounded-full border border-amber-300/25 bg-amber-400/10 px-2.5 py-1 text-[10px] font-bold text-amber-100">MENUNGGU</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => void decide(item.uid, 'approve')} disabled={Boolean(workingUid)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50">
                    <Check className="h-4 w-4" /> {workingUid === item.uid ? 'Memproses…' : 'Setujui'}
                  </button>
                  <button type="button" onClick={() => void decide(item.uid, 'reject')} disabled={Boolean(workingUid)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-300/30 bg-rose-950/40 px-3 py-2.5 text-xs font-bold text-rose-100 hover:bg-rose-900/60 disabled:opacity-50">
                    <X className="h-4 w-4" /> Tolak
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {isOwner && (
        <div className="rounded-2xl border border-sky-300/20 bg-[#0e1c12]/90 p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-sky-200" />
            <h2 className="text-lg font-bold">Delegasi kewenangan Supervisor</h2>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-emerald-100/70">Hanya Owner yang dapat memberi atau mencabut kewenangan. Supervisor lain tidak otomatis dapat menyetujui permohonan.</p>
          <p className="mt-2 text-[11px] leading-relaxed text-emerald-100/60">UID dapat disalin dari Firebase Console → Authentication → Users → pilih akun Supervisor → User UID. Sistem memeriksa peran Supervisor di backend sebelum menyimpan delegasi.</p>
          <form onSubmit={(event) => { event.preventDefault(); void setDelegate(true); }} className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input value={supervisorUid} onChange={(event) => setSupervisorUid(event.target.value)} placeholder="Firebase UID Supervisor" className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/30 px-3 py-3 text-sm text-white outline-none focus:border-sky-300/60" />
            <button type="submit" disabled={Boolean(workingUid)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-3 text-xs font-bold hover:bg-sky-600 disabled:opacity-50">
              <UserPlus className="h-4 w-4" /> Beri kewenangan
            </button>
          </form>
          <div className="mt-4 space-y-2">
            {delegates.length === 0 ? (
              <p className="text-xs text-emerald-100/60">Belum ada Supervisor yang ditunjuk.</p>
            ) : delegates.map((delegate) => (
              <div key={delegate.uid} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="min-w-0">
                  <p className="break-all text-xs font-semibold">{delegate.email || 'Supervisor'}</p>
                  <p className="break-all text-[10px] text-emerald-100/55">UID: {delegate.uid}</p>
                </div>
                <button type="button" onClick={() => void setDelegate(false, delegate.uid)} disabled={Boolean(workingUid)} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300/25 px-2.5 py-2 text-[11px] font-bold text-rose-100 hover:bg-rose-950/50 disabled:opacity-50">
                  <UserMinus className="h-3.5 w-3.5" /> Cabut
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

export default TeamRegistrationAdminView;
