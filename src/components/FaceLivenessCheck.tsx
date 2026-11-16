import React, { useCallback, useState } from 'react';
import { FaceLivenessDetectorCore, type AwsCredentialProvider } from '@aws-amplify/ui-react-liveness';
import { ThemeProvider } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { TEAM_REGISTRATION_API } from '../lib/teamRegistration';

export const SIPANDU_LIVENESS_CONSENT_VERSION = '2026-11-16-v1';

interface FaceLivenessCheckProps {
  email: string;
  onVerified: (proofToken: string) => void;
  onCancel: () => void;
}

interface SessionResponse {
  ok?: boolean;
  message?: string;
  challengeId?: string;
  sessionId?: string;
  region?: string;
}

interface CredentialsResponse {
  ok?: boolean;
  message?: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken: string;
    expiration: string;
  };
}

interface VerifyResponse {
  ok?: boolean;
  status?: string;
  proofToken?: string;
  confidence?: number;
  minimumConfidence?: number;
  message?: string;
}

async function postLiveness<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(TEAM_REGISTRATION_API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const result = await response.json().catch(() => ({})) as T & { message?: string };
  if (!response.ok) {
    throw new Error(result.message || 'Layanan pemeriksaan wajah belum dapat dihubungi.');
  }
  return result;
}

export const FaceLivenessCheck: React.FC<FaceLivenessCheckProps> = ({ email, onVerified, onCancel }) => {
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [session, setSession] = useState<{ challengeId: string; sessionId: string; region: string } | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  const startSession = useCallback(async () => {
    if (!consentAccepted) {
      setError('Persetujuan pemrosesan video wajah harus diberikan terlebih dahulu.');
      return;
    }
    setError('');
    setStatusMessage('');
    setIsStarting(true);
    try {
      const result = await postLiveness<SessionResponse>('/liveness/session', {
        email: email.trim().toLowerCase(),
        consentVersion: SIPANDU_LIVENESS_CONSENT_VERSION,
      });
      if (!result.ok || !result.challengeId || !result.sessionId) {
        throw new Error(result.message || 'Sesi liveness tidak berhasil dibuat.');
      }
      setSession({
        challengeId: result.challengeId,
        sessionId: result.sessionId,
        region: result.region || 'ap-southeast-5',
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sesi pemeriksaan wajah belum berhasil dibuat.');
    } finally {
      setIsStarting(false);
    }
  }, [consentAccepted, email]);

  const credentialProvider: AwsCredentialProvider = useCallback(async () => {
    if (!session) throw new Error('Sesi liveness belum tersedia.');
    const result = await postLiveness<CredentialsResponse>('/liveness/credentials', {
      challengeId: session.challengeId,
    });
    const credentials = result.credentials;
    if (!result.ok || !credentials?.accessKeyId || !credentials.secretAccessKey || !credentials.sessionToken) {
      throw new Error(result.message || 'Kredensial streaming sementara tidak tersedia.');
    }
    return {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
      expiration: new Date(credentials.expiration),
    };
  }, [session]);

  const handleAnalysisComplete = useCallback(async () => {
    if (!session || isChecking) return;
    setIsChecking(true);
    setError('');
    setStatusMessage('Memeriksa hasil liveness langsung di server SIPANDU…');
    try {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const result = await postLiveness<VerifyResponse>('/liveness/verify', {
          challengeId: session.challengeId,
        });
        if (result.status === 'in_progress') {
          setStatusMessage('Analisis video masih berlangsung. Mohon tunggu…');
          await new Promise((resolve) => window.setTimeout(resolve, 1200));
          continue;
        }
        if (!result.ok || result.status !== 'passed' || !result.proofToken) {
          throw new Error(result.message || 'Pemeriksaan wajah belum lulus. Ulangi menggunakan sesi baru.');
        }
        setStatusMessage('Pemeriksaan wajah hidup berhasil. Melanjutkan pendaftaran…');
        onVerified(result.proofToken);
        return;
      }
      throw new Error('Hasil pemeriksaan belum tersedia. Silakan mulai sesi liveness yang baru.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Hasil liveness tidak dapat diverifikasi.');
      setSession(null);
      setStatusMessage('');
    } finally {
      setIsChecking(false);
    }
  }, [isChecking, onVerified, session]);

  const handleLivenessError = useCallback((caught: unknown) => {
    const message = caught && typeof caught === 'object' && 'error' in caught
      ? String((caught as { error?: { message?: string } }).error?.message || '')
      : caught instanceof Error ? caught.message : '';
    setError(message || 'Kamera atau koneksi streaming gagal. Periksa izin kamera dan coba sesi baru.');
    setSession(null);
    setStatusMessage('');
  }, []);

  return (
    <section className="mt-4 rounded-2xl border border-rose-500/40 bg-white/95 p-4 text-left text-slate-900 shadow-xl" aria-live="polite">
      <div className="mb-3">
        <p className="text-xs font-extrabold uppercase tracking-wide text-rose-800">Verifikasi wajah liveness</p>
        <h2 className="mt-1 text-lg font-extrabold">Pastikan pendaftaran dilakukan oleh orang yang benar-benar hadir</h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-700">
          Sistem akan menampilkan tantangan gerakan wajah dan cahaya melalui kamera depan. Pemeriksaan ini mendeteksi upaya memakai foto atau video rekaman; pemeriksaan ini bukan pencocokan wajah dengan KTP dan bukan verifikasi identitas hukum.
        </p>
      </div>

      {!session ? (
        <>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
            <p className="font-bold text-slate-900">Informasi pemrosesan data biometrik</p>
            <p className="mt-1">
              Video wajah dikirim secara langsung ke Amazon Rekognition di region Malaysia (AWS ap-southeast-5) hanya untuk pemeriksaan liveness SIPANDU. SIPANDU tidak menyimpan video atau bingkai wajah. SIPANDU menyimpan status hasil, skor, waktu pemeriksaan, versi persetujuan, dan bukti bahwa persetujuan diberikan bersama catatan pendaftaran selama masa retensi akun (maksimal 365 hari pada catatan pendaftaran).
            </p>
            <p className="mt-1">
              Data wajah merupakan data pribadi biometrik yang bersifat spesifik. Jangan lanjutkan sebelum membaca informasi ini dan memastikan pemrosesan tersebut sesuai dasar hukum serta kebijakan organisasi Anda.
            </p>
          </div>
          <label className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-slate-800">
            <input
              type="checkbox"
              checked={consentAccepted}
              onChange={(event) => setConsentAccepted(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-rose-700"
            />
            <span>
              Saya telah membaca informasi di atas dan secara eksplisit menyetujui pemrosesan sementara video wajah oleh Amazon Rekognition untuk tujuan pemeriksaan liveness saat mendaftar SIPANDU.
            </span>
          </label>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={!consentAccepted || isStarting}
              onClick={() => void startSession()}
              className="flex-1 rounded-xl bg-rose-700 px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isStarting ? 'Menyiapkan pemeriksaan…' : 'Mulai pemeriksaan wajah'}
            </button>
            <button type="button" onClick={onCancel} className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700">
              Batal
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <ThemeProvider>
              <FaceLivenessDetectorCore
                sessionId={session.sessionId}
                region={session.region}
                config={{ credentialProvider }}
                onAnalysisComplete={handleAnalysisComplete}
                onError={handleLivenessError}
                onUserCancel={() => {
                  setSession(null);
                  setStatusMessage('');
                }}
              />
            </ThemeProvider>
          </div>
          <p className="mt-2 text-xs text-slate-600">
            Gunakan kamera depan, cahaya yang cukup, dan ikuti petunjuk pada bingkai wajah. Video diproses oleh layanan AWS; jangan tutup halaman sebelum pemeriksaan selesai.
          </p>
          {statusMessage && <p className="mt-2 text-xs font-semibold text-teal-800">{statusMessage}</p>}
          <button
            type="button"
            onClick={() => {
              setSession(null);
              setStatusMessage('');
              setError('');
            }}
            disabled={isChecking}
            className="mt-3 w-full rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
          >
            Batalkan sesi dan mulai ulang
          </button>
        </>
      )}

      {error && <p role="alert" className="mt-3 rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs leading-relaxed text-rose-900">{error}</p>}
    </section>
  );
};
