import React, { useState } from 'react';
import { createUserWithEmailAndPassword, sendEmailVerification, signOut, updateProfile } from 'firebase/auth';
import { ArrowLeft, Eye, EyeOff, UserPlus, MailCheck } from 'lucide-react';
import { auth, staffAuthPersistenceReady, createSIPANDUUserProfile } from '../lib/firebase';
import { publicAssetUrl } from '../lib/publicAssets';
import { TEAM_REGISTRATION_API } from '../lib/teamRegistration';
import { REGISTRATION_RECOVERY_NOTICE, shouldOfferRegistrationRecovery } from '../lib/registrationRecovery';
import { FaceLivenessFrame, type FaceLivenessSession } from './FaceLivenessFrame';

interface RegistrationPageProps {
  onBack: (email?: string, notice?: string) => void;
  resumeExistingUser?: boolean;
}

export const RegistrationPage: React.FC<RegistrationPageProps> = ({ onBack, resumeExistingUser = false }) => {
  const [nama, setNama] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showRepeatPassword, setShowRepeatPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [canResumeRegistration, setCanResumeRegistration] = useState(false);
  const [accountCreated, setAccountCreated] = useState(false);
  const [livenessConsent, setLivenessConsent] = useState(false);
  const [livenessSession, setLivenessSession] = useState<FaceLivenessSession | null>(null);
  const [livenessIdToken, setLivenessIdToken] = useState('');
  const [livenessConsentVersion, setLivenessConsentVersion] = useState('');
  const [registrationRecorded, setRegistrationRecorded] = useState(false);
  const [isFinishingRegistration, setIsFinishingRegistration] = useState(false);

  React.useEffect(() => {
    if (!resumeExistingUser || !auth.currentUser) return;
    setAccountCreated(true);
    setNama(auth.currentUser.displayName || '');
    setEmail(auth.currentUser.email || '');
  }, [resumeExistingUser]);

  const readLivenessReadiness = async (): Promise<string> => {
    const response = await fetch(`${TEAM_REGISTRATION_API}/liveness/health`, { cache: 'no-store' });
    const result = await response.json().catch(() => ({})) as {
      ready?: boolean;
      consentVersion?: string;
      missing?: string[];
    };
    if (!response.ok || result.ready !== true) {
      const missing = Array.isArray(result.missing) ? result.missing.join(', ') : '';
      throw new Error(missing
        ? `Verifikasi wajah belum siap. Administrator perlu melengkapi konfigurasi: ${missing}.`
        : 'Verifikasi wajah belum siap. Pendaftaran belum dibuat agar akun Anda tidak tertinggal tanpa verifikasi.');
    }
    return typeof result.consentVersion === 'string' ? result.consentVersion : '2026-11-16-v1';
  };

  const createLivenessSession = async (idToken: string, consentVersion: string) => {
    const response = await fetch(`${TEAM_REGISTRATION_API}/liveness/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ consentVersion }),
    });
    const result = await response.json().catch(() => ({})) as {
      ok?: boolean;
      challengeId?: string;
      sessionId?: string;
      region?: string;
      message?: string;
    };
    if (!response.ok || result.ok !== true || !result.challengeId || !result.sessionId || !result.region) {
      throw new Error(result.message || 'Sesi verifikasi wajah belum dapat dibuat. Coba kembali.');
    }
    setLivenessIdToken(idToken);
    setLivenessConsentVersion(consentVersion);
    setLivenessSession({
      challengeId: result.challengeId,
      sessionId: result.sessionId,
      region: result.region,
    });
    setError('');
  };

  const retryLiveness = async () => {
    if (!livenessConsent) {
      setError('Persetujuan pemeriksaan video wajah perlu diberikan sebelum melanjutkan.');
      return;
    }
    const user = auth.currentUser;
    if (!user) {
      setError('Sesi akun tidak ditemukan. Masuk kembali untuk melanjutkan pendaftaran.');
      return;
    }
    setIsSubmitting(true);
    setError('');
    try {
      const consentVersion = await readLivenessReadiness();
      const idToken = await user.getIdToken(true);
      await createLivenessSession(idToken, consentVersion);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sesi verifikasi wajah belum dapat dimulai.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const finishRegistration = async (proofToken?: string) => {
    const user = auth.currentUser;
    if (!user) {
      setError('Sesi Firebase berakhir. Masuk kembali untuk melanjutkan verifikasi wajah.');
      setLivenessSession(null);
      return;
    }
    setIsFinishingRegistration(true);
    setError('');
    try {
      const idToken = await user.getIdToken(true);
      const registrationResponse = await fetch(`${TEAM_REGISTRATION_API}/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(registrationRecorded ? {} : { livenessProofToken: proofToken || '' }),
      });
      const registrationResult = await registrationResponse.json().catch(() => ({})) as {
        ok?: boolean;
        status?: string;
        code?: string;
        message?: string;
      };
      if (!registrationResponse.ok || (registrationResult.status !== 'pending_email' && registrationResult.status !== 'active')) {
        throw new Error(registrationResult.message || 'Pendaftaran mandiri belum berhasil dicatat.');
      }
      if (registrationResult.status === 'pending_email') setRegistrationRecorded(true);
      await sendEmailVerification(user);
      await signOut(auth);
      setLivenessSession(null);
      setEmail(user.email || email.trim().toLowerCase());
      setCompleted(true);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Pendaftaran belum berhasil diselesaikan.';
      setError(message);
      // A one-time proof can be consumed even if a later persistence operation
      // fails. Require a fresh challenge rather than reusing that proof.
      if (!registrationRecorded) setLivenessSession(null);
    } finally {
      setIsFinishingRegistration(false);
    }
  };

  const handleLivenessPassed = (proofToken: string) => {
    void finishRegistration(proofToken);
  };

  const handleLivenessError = (message: string) => {
    setError(message);
    setLivenessSession(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setCanResumeRegistration(false);
    if (password.length < 8) {
      setError('Password minimal 8 karakter.');
      return;
    }
    if (password !== repeatPassword) {
      setError('Ulangi Password belum sama dengan Password.');
      return;
    }
    if (!livenessConsent) {
      setError('Persetujuan pemeriksaan video wajah perlu diberikan sebelum melanjutkan.');
      return;
    }
    setIsSubmitting(true);
    let firebaseAccountCreated = false;
    let profileReady = false;
    const normalizedEmail = email.trim().toLowerCase();
    try {
      if (accountCreated && auth.currentUser) {
        await retryLiveness();
        return;
      }
      await staffAuthPersistenceReady;
      const consentVersion = await readLivenessReadiness();
      const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
      firebaseAccountCreated = true;
      await updateProfile(credential.user, { displayName: nama.trim() });
      await createSIPANDUUserProfile(credential.user.uid, normalizedEmail, {
        nama: nama.trim(),
        nip: '',
        jabatan: '',
        unitKerja: '',
        noHp: '',
        photoUrl: '',
      });
      profileReady = true;
      setAccountCreated(true);
      const idToken = await credential.user.getIdToken(true);
      await createLivenessSession(idToken, consentVersion);
    } catch (caught) {
      const code = (caught as { code?: string })?.code;
      let message = caught instanceof Error ? caught.message : 'Pendaftaran akun SIPANDU belum berhasil.';
      if (code === 'auth/email-already-in-use') message = 'Email tersebut sudah terdaftar. Silakan kembali dan masuk dengan akun yang ada.';
      else if (code === 'auth/invalid-email') message = 'Format email belum benar.';
      else if (code === 'auth/weak-password') message = 'Password terlalu lemah. Gunakan minimal 8 karakter.';
      else if (code === 'auth/operation-not-allowed') message = 'Pendaftaran email dan password belum diaktifkan di Firebase Authentication.';
      const offerRecovery = shouldOfferRegistrationRecovery(firebaseAccountCreated, code);
      if (offerRecovery) {
        message = code === 'auth/email-already-in-use'
          ? `Email ini sudah terdaftar. ${REGISTRATION_RECOVERY_NOTICE}`
          : `${message} ${REGISTRATION_RECOVERY_NOTICE}`;
        setCanResumeRegistration(true);
      }
      // Keep a profile-ready Firebase account signed in so the owner can retry
      // the liveness challenge without creating a duplicate identity.
      if (firebaseAccountCreated && profileReady && auth.currentUser) {
        setAccountCreated(true);
        setCanResumeRegistration(false);
        message = `Akun sudah dibuat. Anda dapat mengulangi pemeriksaan wajah tanpa membuat akun kedua. ${message}`;
      } else if (auth.currentUser) {
        // If profile creation failed, route through the existing idempotent recovery flow.
        try { await signOut(auth); } catch { /* the user can retry from the login screen */ }
      }
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-x-hidden px-3 py-5 text-slate-800">
      <img
        aria-hidden="true"
        alt=""
        src={publicAssetUrl('uploads/Wallpaper Background Landingpage.webp')}
        loading="eager"
        decoding="async"
        onError={(event) => {
          const image = event.currentTarget;
          if (image.dataset.fallback !== '1') {
            image.dataset.fallback = '1';
            image.src = publicAssetUrl('uploads/Wallpaper Background Landingpage.jpg');
          } else {
            image.style.display = 'none';
          }
        }}
        className="absolute inset-0 z-0 h-full w-full object-cover object-center"
      />
      <main className="relative z-10 w-full max-w-md">
        <section className="rounded-2xl border border-white/80 bg-white/[0.28] p-5 shadow-[0_12px_40px_rgba(20,40,35,0.18),inset_0_1px_0_rgba(255,255,255,0.65)] backdrop-blur-[14px]">
          <button type="button" onClick={() => onBack(email)} className="mb-3 inline-flex items-center gap-2 text-xs font-semibold text-black underline underline-offset-4">
            <ArrowLeft className="h-4 w-4" /> Kembali ke login
          </button>
          <div className="mb-4 text-center">
            <img src={publicAssetUrl('uploads/Logo Kemensos Hadir.png')} alt="Logo resmi Kemensos Hadir" className="mx-auto mb-2 h-auto w-[135px] max-w-full object-contain" />
            <h1 className="text-xl font-extrabold text-black">Pendaftaran Akun SIPANDU</h1>
            <p className="mt-1 text-xs text-black">Buat akun menggunakan nama, email aktif, dan kata sandi. Verifikasi email untuk mengaktifkan keanggotaan dasar SIPANDU.</p>
          </div>

          {completed ? (
            <div className="rounded-xl border border-emerald-700/30 bg-white/75 p-4 text-center text-black">
              <MailCheck className="mx-auto mb-2 h-9 w-9 text-emerald-700" />
              <h2 className="text-base font-bold">Pendaftaran berhasil</h2>
              <p className="mt-2 text-xs leading-relaxed">Akun untuk <strong>{email}</strong> sudah dibuat. Tautan verifikasi telah dikirim ke email tersebut. Buka tautan verifikasi, lalu masuk kembali ke SIPANDU. Setelah email terverifikasi, akun akan aktif otomatis sebagai anggota dengan hak dasar; akses data responden dan fitur staf tetap memerlukan pemberian peran oleh administrator.</p>
              <button type="button" onClick={() => onBack(email, 'Tautan verifikasi email sudah dikirim. Verifikasi email terlebih dahulu, lalu masuk kembali.')} className="mt-4 w-full rounded-xl bg-teal-700 px-4 py-3 text-sm font-bold text-white">Kembali ke halaman login</button>
            </div>
          ) : accountCreated ? (
            <div className="space-y-3 rounded-xl border border-slate-300 bg-white/80 p-4 text-black">
              <div className="text-center">
                <h2 className="text-base font-bold">Verifikasi wajah diperlukan</h2>
                <p className="mt-1 text-xs leading-relaxed">
                  Akun untuk <strong>{email}</strong> sudah dibuat. Selesaikan pemeriksaan wajah melalui kamera langsung untuk meneruskan pendaftaran.
                </p>
              </div>
              {error && <div role="alert" className="rounded-lg border border-red-400 bg-red-100/95 p-3 text-center text-xs font-medium text-black">{error}</div>}
              <label className="flex items-start gap-2 rounded-lg border border-slate-300 bg-white p-3 text-[11px] leading-relaxed text-slate-800">
                <input
                  type="checkbox"
                  checked={livenessConsent}
                  onChange={(event) => setLivenessConsent(event.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-teal-700"
                />
                <span>
                  Saya menyetujui pemeriksaan video wajah langsung oleh Amazon Rekognition untuk memeriksa keaslian pendaftar. Video digunakan untuk proses verifikasi sesuai layanan AWS.
                </span>
              </label>
              {isFinishingRegistration ? (
                <div className="rounded-lg bg-slate-100 p-4 text-center text-sm font-semibold">Menyimpan pendaftaran dan mengirim tautan verifikasi email…</div>
              ) : livenessSession && livenessIdToken ? (
                <FaceLivenessFrame
                  session={livenessSession}
                  idToken={livenessIdToken}
                  onPassed={handleLivenessPassed}
                  onError={handleLivenessError}
                />
              ) : registrationRecorded ? (
                <button
                  type="button"
                  onClick={() => void finishRegistration()}
                  disabled={isFinishingRegistration}
                  className="w-full rounded-xl bg-teal-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
                >
                  Kirim ulang tautan verifikasi email
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void retryLiveness()}
                  disabled={isSubmitting}
                  className="w-full rounded-xl bg-teal-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
                >
                  {isSubmitting ? 'Menyiapkan kamera…' : 'Mulai / ulangi verifikasi wajah'}
                </button>
              )}
              <p className="text-[11px] leading-relaxed text-slate-600">
                Video wajah digunakan untuk pemeriksaan keaslian secara langsung oleh Amazon Rekognition. Pemeriksaan ini berbeda dari unggahan foto diri, KTP, atau KK.
              </p>
              <button
                type="button"
                onClick={() => onBack(email.trim().toLowerCase(), 'Pendaftaran belum selesai. Masuk kembali dengan akun yang sama untuk melanjutkan verifikasi wajah.')}
                className="w-full rounded-xl border border-slate-400 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700"
              >
                Kembali ke login
              </button>
            </div>
          ) : (
            <>
              {error && <div role="alert" className="mb-3 rounded-lg border border-red-400 bg-red-100/95 p-3 text-center text-xs font-medium text-black">{error}</div>}
              {canResumeRegistration && (
                <button
                  type="button"
                  onClick={() => onBack(email.trim().toLowerCase(), REGISTRATION_RECOVERY_NOTICE)}
                  className="mb-3 w-full rounded-xl border border-teal-800 bg-white/90 px-4 py-3 text-sm font-bold text-teal-900 underline-offset-4 hover:bg-teal-50"
                >
                  Lanjutkan pendaftaran lewat login
                </button>
              )}
              <form onSubmit={(event) => void handleSubmit(event)} className="space-y-2.5">
                <label className="block text-xs font-semibold text-black">Nama
                  <input value={nama} onChange={(event) => setNama(event.target.value)} autoComplete="name" maxLength={120} required placeholder="Nama lengkap" className="mt-1 w-full rounded-lg border border-white bg-white/75 px-3 py-2.5 text-sm text-black placeholder-slate-500 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20" />
                </label>
                <label className="block text-xs font-semibold text-black">Email
                  <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" maxLength={254} required placeholder="nama@instansi.go.id" className="mt-1 w-full rounded-lg border border-white bg-white/75 px-3 py-2.5 text-sm text-black placeholder-slate-500 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20" />
                </label>
                <label className="block text-xs font-semibold text-black">Password
                  <span className="relative mt-1 block">
                    <input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={8} maxLength={128} required placeholder="Minimal 8 karakter" className="w-full rounded-lg border border-white bg-white/75 px-3 py-2.5 pr-10 text-sm text-black placeholder-slate-500 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20" />
                    <button type="button" aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'} onClick={() => setShowPassword((value) => !value)} className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-600">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                  </span>
                </label>
                <label className="block text-xs font-semibold text-black">Ulangi Password
                  <span className="relative mt-1 block">
                    <input type={showRepeatPassword ? 'text' : 'password'} value={repeatPassword} onChange={(event) => setRepeatPassword(event.target.value)} autoComplete="new-password" minLength={8} maxLength={128} required placeholder="Masukkan ulang password" className="w-full rounded-lg border border-white bg-white/75 px-3 py-2.5 pr-10 text-sm text-black placeholder-slate-500 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20" />
                    <button type="button" aria-label={showRepeatPassword ? 'Sembunyikan password' : 'Tampilkan password'} onClick={() => setShowRepeatPassword((value) => !value)} className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-600">{showRepeatPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                  </span>
                </label>
                <label className="flex items-start gap-2 rounded-lg border border-slate-300 bg-white/80 p-3 text-[11px] leading-relaxed text-slate-800">
                  <input
                    type="checkbox"
                    checked={livenessConsent}
                    onChange={(event) => setLivenessConsent(event.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-teal-700"
                    required
                  />
                  <span>
                    Saya menyetujui pemeriksaan video wajah langsung oleh Amazon Rekognition untuk memeriksa keaslian pendaftar. Video digunakan untuk proses verifikasi sesuai layanan AWS dan tidak menggantikan unggahan dokumen asesmen.
                  </span>
                </label>
                <button type="submit" disabled={isSubmitting} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-3 text-sm font-bold uppercase tracking-wide text-white shadow-md transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60">
                  <UserPlus className="h-4 w-4" /> {isSubmitting ? 'Menyiapkan verifikasi…' : 'Lanjutkan ke verifikasi wajah'}
                </button>
              </form>
            </>
          )}
        </section>
      </main>
    </div>
  );
};
