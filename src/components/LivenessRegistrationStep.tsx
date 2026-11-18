import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { ArrowLeft, Camera, LoaderCircle, ShieldCheck } from 'lucide-react';
import { TEAM_REGISTRATION_API } from '../lib/teamRegistration';
import {
  createLivenessSession,
  getLivenessHealth,
  isLivenessFrameReadyMessage,
  parseLivenessFrameMessage,
  type LivenessHealth,
  type LivenessSession,
  type LivenessPurpose,
} from '../lib/livenessRegistration';

interface LivenessRegistrationStepProps {
  user: User;
  onProof: (proofToken: string) => Promise<void>;
  onCancel: () => void | Promise<void>;
  purpose?: LivenessPurpose;
}

const LIVENESS_FRAME_ORIGIN = new URL(TEAM_REGISTRATION_API).origin;

export const LivenessRegistrationStep: React.FC<LivenessRegistrationStepProps> = ({
  user,
  onProof,
  onCancel,
  purpose = 'registration',
}) => {
  const [health, setHealth] = useState<LivenessHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState('');
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [session, setSession] = useState<LivenessSession | null>(null);
  const [nonce, setNonce] = useState('');
  const [starting, setStarting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const initializedChallengeRef = useRef<string | null>(null);
  const proofHandledRef = useRef(false);
  const onProofRef = useRef(onProof);

  useEffect(() => {
    onProofRef.current = onProof;
  }, [onProof]);

  const refreshHealth = useCallback(async () => {
    setHealthLoading(true);
    setHealthError('');
    try {
      const result = await getLivenessHealth();
      setHealth(result);
    } catch (caught) {
      setHealth(null);
      setHealthError(caught instanceof Error ? caught.message : 'Status layanan verifikasi wajah tidak dapat dibaca.');
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshHealth();
  }, [refreshHealth]);

  useEffect(() => {
    if (!session) {
      setSecondsLeft(null);
      return;
    }
    // AWS SessionIds expire after three minutes. Keep a 15-second margin for
    // camera permission prompts, stream setup, and the result callback.
    const deadline = Date.now() + Math.max(1, session.expiresInSeconds - 15) * 1000;
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0) {
        setError('Sesi verifikasi wajah telah kedaluwarsa. Mulai sesi baru untuk mencoba kembali.');
        setSession(null);
        setNonce('');
        initializedChallengeRef.current = null;
        proofHandledRef.current = false;
      }
    };
    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [session]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== LIVENESS_FRAME_ORIGIN
        || event.source !== iframeRef.current?.contentWindow) return;

      if (isLivenessFrameReadyMessage(event.data)) {
        if (!session || !nonce || initializedChallengeRef.current === session.challengeId) return;
        initializedChallengeRef.current = session.challengeId;
        void user.getIdToken(true).then((idToken) => {
          iframeRef.current?.contentWindow?.postMessage({
            type: 'sipandu:liveness:init',
            nonce,
            challengeId: session.challengeId,
            sessionId: session.sessionId,
            idToken,
            region: session.region,
            purpose,
          }, LIVENESS_FRAME_ORIGIN);
        }).catch((caught) => {
          setError(caught instanceof Error ? caught.message : 'Sesi Firebase tidak dapat diperbarui.');
          setSession(null);
          setNonce('');
        });
        return;
      }

      if (!nonce || proofHandledRef.current) return;
      const message = parseLivenessFrameMessage(event.data, nonce, session?.challengeId || '');
      if (!message) return;

      if (message.type === 'error') {
        setError(message.message);
        setSession(null);
        setNonce('');
        initializedChallengeRef.current = null;
        return;
      }

      proofHandledRef.current = true;
      setProcessing(true);
      void onProofRef.current(message.proofToken).catch((caught) => {
        setError(caught instanceof Error ? caught.message : 'Pendaftaran belum berhasil diselesaikan.');
        setSession(null);
        setNonce('');
        initializedChallengeRef.current = null;
        proofHandledRef.current = false;
      }).finally(() => setProcessing(false));
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [nonce, session, user]);

  const startLiveness = async () => {
    if (!health?.ready) {
      setError('Layanan verifikasi wajah belum siap. Administrator perlu melengkapi konfigurasi Worker dan AWS.');
      return;
    }
    if (!consentAccepted) {
      setError('Persetujuan pemrosesan video wajah harus diberikan sebelum kamera dimulai.');
      return;
    }
    setStarting(true);
    setError('');
    initializedChallengeRef.current = null;
    proofHandledRef.current = false;
    try {
      const nextSession = await createLivenessSession(user, health.consentVersion, purpose);
      setNonce(crypto.randomUUID());
      setSession(nextSession);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sesi verifikasi wajah belum dapat dibuat.');
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-x-hidden bg-slate-950/90 px-3 py-5 text-slate-900">
      <main className="w-full max-w-xl rounded-2xl border border-white/70 bg-white p-5 shadow-2xl sm:p-7">
        <button
          type="button"
          onClick={() => void onCancel()}
          disabled={processing || starting}
          className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-slate-700 underline underline-offset-4 disabled:opacity-50"
        >
          <ArrowLeft className="h-4 w-4" /> {purpose === 'login' ? 'Kembali ke pilihan login' : 'Kembali'}
        </button>
        <div className="mb-4 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-teal-800">
            <Camera className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-extrabold text-slate-900">{purpose === 'login' ? 'Verifikasi Wajah Tambahan' : 'Verifikasi Wajah Hidup'}</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            {purpose === 'login'
              ? 'Verifikasi ini bersifat opsional sebagai lapisan keamanan tambahan saat masuk kembali ke akun SIPANDU. Anda dapat kembali dan melewatinya kapan saja.'
              : 'Langkah ini diperlukan untuk mencatat pendaftaran akun SIPANDU. Pastikan kamera perangkat dapat digunakan.'}
          </p>
        </div>

        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
          <div className="mb-1 flex items-center gap-2 font-bold text-slate-900">
            <ShieldCheck className="h-4 w-4" /> Persetujuan pemrosesan biometrik
          </div>
          Verifikasi menggunakan kamera dan Amazon Rekognition Face Liveness. Video atau stream kamera dikirim ke layanan AWS untuk dianalisis. SIPANDU menerima hasil pemeriksaan dan bukti sekali pakai. Detail pemrosesan serta retensi mengikuti kebijakan privasi organisasi dan layanan AWS. Lanjutkan hanya jika Anda menyetujui pemrosesan ini.
        </div>

        {healthLoading ? (
          <div className="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-600">
            <LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" /> Memeriksa kesiapan layanan…
          </div>
        ) : healthError ? (
          <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-900">
            {healthError}
            <button type="button" onClick={() => void refreshHealth()} className="mt-2 block font-bold underline">Periksa kembali</button>
          </div>
        ) : health && !health.ready ? (
          <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
            Layanan belum siap. Administrator perlu melengkapi konfigurasi berikut pada Worker <strong>sipandu-registration</strong>:
            {health.missing?.length ? (
              <ul className="mt-2 list-disc pl-5">
                {health.missing.map((item) => <li key={item}>{item}</li>)}
              </ul>
            ) : <p className="mt-1">Periksa secret AWS dan binding Durable Object.</p>}
          </div>
        ) : null}

        <label className="my-4 flex items-start gap-2 text-xs leading-relaxed text-slate-700">
          <input
            type="checkbox"
            checked={consentAccepted}
            onChange={(event) => setConsentAccepted(event.target.checked)}
            disabled={!health?.ready || Boolean(session) || processing}
            className="mt-0.5 h-4 w-4 shrink-0 accent-teal-700"
          />
          <span>Saya telah membaca keterangan di atas dan menyetujui penggunaan kamera serta pemrosesan video wajah untuk verifikasi liveness.</span>
        </label>

        {error && <div role="alert" className="mb-3 rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-900">{error}</div>}

        {session ? (
          <div className="space-y-3">
            <p className="text-center text-xs font-semibold text-slate-700">Ikuti instruksi gerakan wajah pada panel kamera di bawah ini.</p>
            {secondsLeft !== null && (
              <p role="timer" aria-live="polite" className="text-center text-xs font-bold text-amber-800">
                Sisa waktu sesi: {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}. Selesaikan sekarang.
              </p>
            )}
            <iframe
              ref={iframeRef}
              key={session.challengeId}
              title="Kamera verifikasi wajah SIPANDU"
              src={`${TEAM_REGISTRATION_API}/liveness/ui`}
              allow="camera; fullscreen"
              referrerPolicy="no-referrer"
              onError={() => setError('Panel kamera tidak dapat dimuat. Periksa koneksi dan konfigurasi Worker.')}
              className="h-[520px] w-full rounded-xl border border-slate-200 bg-slate-50"
            />
            {processing && (
              <p role="status" className="text-center text-sm font-semibold text-teal-800">
                <LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" /> {purpose === 'login' ? 'Memeriksa bukti verifikasi login…' : 'Memeriksa bukti dan menyimpan pendaftaran…'}
              </p>
            )}
            <button
              type="button"
              onClick={() => { setSession(null); setNonce(''); setError('Sesi dihentikan. Mulai sesi baru untuk mencoba kembali.'); }}
              disabled={processing}
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700 disabled:opacity-50"
            >
              Batalkan sesi kamera
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void startLiveness()}
            disabled={!health?.ready || !consentAccepted || starting || healthLoading || Boolean(healthError)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-3 text-sm font-bold text-white shadow-md transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {starting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            {starting ? 'Membuat sesi aman…' : (purpose === 'login' ? 'Mulai verifikasi wajah tambahan' : 'Mulai verifikasi wajah')}
          </button>
        )}
      </main>
    </div>
  );
};
