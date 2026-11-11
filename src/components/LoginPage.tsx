import React, { useRef, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, sendEmailVerification, signOut, type User as FirebaseUser } from 'firebase/auth';
import { auth, staffAuthPersistenceReady } from '../lib/firebase';
import { authenticateBiometricLock, isBiometricLockEnabled } from '../lib/biometricLock';
import { Lock, User, Eye, EyeOff, Fingerprint, ArrowRight } from 'lucide-react';
import { publicAssetUrl } from '../lib/publicAssets';
import { RegistrationPage } from './RegistrationPage';

const LOGIN_TIMEOUT_MS = 18_000;

interface LoginPageProps {
  onLogin: (userName: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [restoredUser, setRestoredUser] = useState<FirebaseUser | null>(auth.currentUser);
  const [authReady, setAuthReady] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [forcePasswordLogin, setForcePasswordLogin] = useState(false);
  const [showRegistration, setShowRegistration] = useState(false);
  const [registrationNotice, setRegistrationNotice] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const quickUnlockUser = restoredUser || auth.currentUser;
  const quickUnlockActive = Boolean(quickUnlockUser && isBiometricLockEnabled(quickUnlockUser.uid) && !forcePasswordLogin);

  React.useEffect(() => {
    // Wait for Firebase to restore its persisted session before deciding whether
    // the first tap should open biometric unlock or submit the password form.
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setRestoredUser(user);
      setAuthReady(true);
    });
    return unsubscribe;
  }, []);

  const handlePrimaryAction = async () => {
    if (!authReady) {
      setErrorMsg('Memulihkan sesi SIPANDU. Tunggu sebentar lalu tekan Masuk sekali lagi.');
      return;
    }
    const currentUser = restoredUser || auth.currentUser;
    // On a registered account, the primary action always opens Android's native
    // biometric prompt first. Password entry remains an explicit fallback.
    if (currentUser && isBiometricLockEnabled(currentUser.uid) && !forcePasswordLogin) {
      setErrorMsg('');
      setIsSubmitting(true);
      try {
        await authenticateBiometricLock(currentUser.uid);
        onLogin(currentUser.displayName || currentUser.email || 'Pengguna SIPANDU');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Verifikasi biometrik gagal.';
        setErrorMsg(`Biometrik belum berhasil. ${message} Pilih “Gunakan email dan kata sandi” untuk pemulihan akun.`);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }
    // Preserve browser validation and the existing email/password login flow.
    formRef.current?.requestSubmit();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setIsSubmitting(true);
    let timeoutId: number | undefined;
    try {
      // A stalled mobile request must not leave the submit button disabled forever.
      await staffAuthPersistenceReady;
      const credential = await Promise.race([
        signInWithEmailAndPassword(auth, email.trim(), password),
        new Promise<never>((_, reject) => {
          timeoutId = window.setTimeout(() => {
            reject({ code: 'sipandu/login-timeout' });
          }, LOGIN_TIMEOUT_MS);
        }),
      ]);
      // Refresh the cached Firebase profile after password sign-in. This
      // prevents a recently verified email from being treated as unverified.
      await credential.user.reload();
      const signedInToken = await credential.user.getIdTokenResult(true);
      const existingStaffRole = signedInToken.claims.role;
      if (!credential.user.emailVerified && existingStaffRole !== 'owner' && existingStaffRole !== 'supervisor' && existingStaffRole !== 'pendamping') {
        const idToken = await credential.user.getIdToken(true);
        const statusResponse = await fetch('https://sipandu-registration.aryprayoga139.workers.dev/registration-status', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + idToken,
          },
          body: JSON.stringify({}),
        });
        const registration = await statusResponse.json().catch(() => ({})) as { ok?: boolean; status?: string; message?: string };
        await signOut(auth);
        if (!statusResponse.ok || !registration.ok) {
          setErrorMsg(registration.message || 'Status permohonan belum dapat diperiksa. Coba kembali beberapa saat lagi.');
          return;
        }
        if (registration.status === 'pending_owner') {
          setRegistrationNotice('Permohonan Anda masih menunggu persetujuan Owner atau Supervisor yang ditunjuk. Tautan verifikasi belum dikirim.');
          setErrorMsg('');
          return;
        }
        if (registration.status === 'rejected') {
          setErrorMsg(registration.message || 'Permohonan pendaftaran ditolak. Hubungi administrator SIPANDU.');
          return;
        }
        if (registration.status !== 'approved' && registration.status !== 'pending_email') {
          setErrorMsg(registration.message || 'Permohonan belum disetujui. Akun belum dapat diaktifkan.');
          return;
        }
        // Send the Firebase verification link only after the Worker confirms approval.
        await sendEmailVerification(credential.user);
        setRegistrationNotice('Permohonan telah disetujui. Tautan verifikasi email baru telah dikirim. Buka email tersebut, verifikasi, lalu masuk kembali.');
        setErrorMsg('');
        return;
      }
      onLogin(credential.user.displayName || credential.user.email || 'Pengguna SIPANDU');
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === 'sipandu/login-timeout') {
        setErrorMsg('Login belum mendapat jawaban setelah 18 detik. Periksa koneksi dan status sesi sebelum mencoba kembali. Bila permintaan sudah diproses, muat ulang aplikasi untuk memeriksa apakah sesi telah aktif.');
      } else if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        setErrorMsg('Email atau kata sandi tidak sesuai.');
      } else if (code === 'auth/too-many-requests') {
        setErrorMsg('Terlalu banyak percobaan. Tunggu sebentar sebelum mencoba lagi.');
      } else if (code === 'auth/operation-not-allowed') {
        setErrorMsg('Login email/kata sandi belum diaktifkan di Firebase Authentication.');
      } else if (code === 'auth/network-request-failed') {
        setErrorMsg('Firebase tidak dapat dijangkau. Periksa koneksi internet atau pemblokiran jaringan, lalu coba lagi.');
      } else if (code === 'auth/invalid-api-key' || code === 'auth/configuration-not-found') {
        setErrorMsg('Konfigurasi Firebase Authentication tidak valid. Administrator perlu memeriksa konfigurasi proyek Firebase SIPANDU.');
      } else {
        setErrorMsg('Login belum berhasil. Pastikan akun aktif, konfigurasi Firebase benar, dan koneksi internet tersedia.');
      }
    } finally {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      setIsSubmitting(false);
    }
  };

  if (showRegistration) {
    return <RegistrationPage onBack={(registeredEmail, notice) => {
      if (registeredEmail) setEmail(registeredEmail);
      setPassword('');
      setShowRegistration(false);
      setErrorMsg('');
      setRegistrationNotice(notice || '');
    }} />;
  }

  return (
    <>
      <style>{`
        .sipandu-login-shell {
          width: min(800px, calc(100vw - 36px));
          grid-template-columns: minmax(0, 1fr);
        }
        .sipandu-login-branding { display: none; }
        .sipandu-login-form {
          min-width: 0;
          background: rgba(255, 255, 255, 0.20);
          border-radius: 1.25rem;
          border: 1px solid rgba(255, 255, 255, 0.68);
          backdrop-filter: blur(30px) saturate(115%);
          -webkit-backdrop-filter: blur(30px) saturate(115%);
          box-shadow: 0 16px 44px rgba(8, 31, 54, 0.24);
        }
        @media (orientation: portrait) {
          .sipandu-login-shell {
            width: min(360px, calc(100vw - 32px));
            grid-template-columns: minmax(0, 1fr);
            border-radius: 1.25rem;
            background: rgba(255, 255, 255, 0.16);
            border: 1px solid rgba(255, 255, 255, 0.72);
            backdrop-filter: blur(30px) saturate(115%);
            -webkit-backdrop-filter: blur(30px) saturate(115%);
          }
          .sipandu-login-branding { display: none !important; }
          .sipandu-login-form {
            background: rgba(255, 255, 255, 0.20);
            border: 0;
            border-radius: inherit;
            box-shadow: none;
          }
        }
        @media (orientation: landscape) {
          .sipandu-login-shell {
            width: min(800px, calc(100vw - 36px));
            max-width: 800px;
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
            border-radius: 1.5rem;
            background: rgba(255, 255, 255, 0.16);
            backdrop-filter: blur(24px);
            -webkit-backdrop-filter: blur(24px);
          }
          .sipandu-login-branding { display: flex; }
          .sipandu-login-form {
            background: #ffffff;
            border: 0;
            border-radius: 0;
            backdrop-filter: none;
            -webkit-backdrop-filter: none;
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.9);
          }
        }
        @media (orientation: landscape) and (max-height: 560px) {
          .sipandu-login-shell { min-height: 0; }
          .sipandu-login-branding { padding-top: 1.25rem; padding-bottom: 1.25rem; }
          .sipandu-login-form { padding-top: 1.25rem; padding-bottom: 1.25rem; }
        }
      `}</style>
      <div className="relative flex min-h-[100dvh] w-full items-center justify-center overflow-x-hidden px-3 py-4 text-slate-800">
      {/* Pertahankan wallpaper SIPANDU yang sudah ada; efek kaca hanya diterapkan pada panel login. */}
      <img
        aria-hidden="true"
        alt=""
        src={publicAssetUrl('uploads/Wallpaper Background Landingpage.webp')}
        loading="eager"
        fetchPriority="high"
        decoding="async"
        onError={(event) => {
          const image = event.currentTarget;
          // Fall back to the source JPEG if the optimized asset is unavailable.
          if (image.dataset.fallback !== '1') {
            image.dataset.fallback = '1';
            image.src = publicAssetUrl('uploads/Wallpaper Background Landingpage.jpg');
          } else {
            image.style.display = 'none';
          }
        }}
        className="absolute inset-0 z-0 h-full w-full object-cover object-center"
      />

      {/* Panel glassmorphism responsif; wallpaper asli tetap terlihat di belakangnya. */}
      <main className="sipandu-login-shell relative z-10 mx-auto grid items-stretch gap-0 overflow-hidden rounded-3xl border border-white/70 bg-white/[0.16] shadow-2xl">
        <section className="sipandu-login-branding relative min-w-0 flex-col justify-between bg-slate-900/40 p-6 text-white backdrop-blur-md">
          <div className="relative z-10 mt-5 max-w-full text-white">
            <h1 className="text-3xl font-bold leading-tight tracking-tight">SIPANDU</h1>
            <p className="mt-2 text-base font-semibold leading-snug text-white/95">
              Sistem Informasi &amp; Pendampingan Terpadu
            </p>
            <p className="mt-3 max-w-full text-xs leading-relaxed text-white/85">
              Layanan Terintegrasi Database PPKS ODHIV Sumatera Utara untuk pengelolaan data yang akurat, terpadu, dan akuntabel untuk program Asistensi (ATENSI).
            </p>
          </div>
          <div className="relative z-10 mt-5 flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-slate-900/55 p-1.5 shadow-lg backdrop-blur-md">
              <img
                src={publicAssetUrl('uploads/Logo Kemensos.png')}
                alt="Logo Kementerian Sosial RI"
                className="h-full w-full object-contain"
                loading="eager"
                decoding="async"
              />
            </div>
            <div className="min-w-0 text-white">
              <p className="text-xs font-semibold">Kementerian Sosial RI</p>
              <p className="mt-1 max-w-full text-[10px] leading-relaxed text-white/75">
                Direktorat Rehabilitasi Sosial Korban Penyalahgunaan Narkoba &amp; ODHIV
              </p>
            </div>
          </div>
        </section>

        <section className="sipandu-login-form flex w-full min-w-0 flex-col justify-center p-5 sm:p-7">
          <div className="mb-5 flex flex-col items-center text-center">
            <div className="mb-4 flex w-full min-w-0 items-center justify-center gap-3">
              <img
                src={publicAssetUrl('uploads/Logo Kemensos.png')}
                alt="Logo Kementerian Sosial Republik Indonesia"
                className="h-[42px] w-[72px] object-contain"
                loading="eager"
                decoding="async"
              />
              <span aria-hidden="true" className="h-8 w-px shrink-0 bg-slate-300/90" />
              <img
                src={publicAssetUrl('uploads/sipandu-logo.png')}
                alt="Logo SIPANDU"
                className="h-[42px] w-[92px] object-contain"
                loading="eager"
                decoding="async"
              />
            </div>
            <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-800">
              Selamat Datang 👋
            </h1>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Silahkan masuk ke akun SIPANDU Anda
            </p>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="mb-3 rounded-md border border-red-400/80 bg-red-100/95 p-2 text-center text-xs font-medium text-black"
            >
              {errorMsg}
            </div>
          )}

          <form ref={formRef} onSubmit={handleSubmit} className="space-y-2.5">
            <div>
              <label
                htmlFor="sipandu-email"
                className="mb-1 block text-xs font-semibold text-slate-800"
              >
                Email / Username
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-600">
                  <User className="h-4 w-4" />
                </div>
                <input
                  id="sipandu-email"
                  type={quickUnlockActive ? 'text' : 'email'}
                  autoComplete="username"
                  value={quickUnlockActive ? '••••••••••••' : email}
                  readOnly={quickUnlockActive}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Masukkan email akun SIPANDU Anda..."
                  className="w-full min-w-0 rounded-lg border border-white/90 bg-white/55 py-2.5 pl-9 pr-3 text-sm text-slate-800 placeholder-slate-600/80 shadow-sm outline-none transition focus:border-teal-700 focus:bg-white/75 focus:ring-2 focus:ring-teal-700/25"
                  required={!quickUnlockActive}
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="sipandu-password"
                className="mb-1 block text-[11px] font-semibold text-black"
              >
                Password
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-black">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  id="sipandu-password"
                  type={quickUnlockActive ? 'text' : (showPassword ? 'text' : 'password')}
                  autoComplete="current-password"
                  value={quickUnlockActive ? '••••••' : password}
                  readOnly={quickUnlockActive}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan password Anda..."
                  className="w-full min-w-0 rounded-lg border border-white/90 bg-white/55 py-2.5 pl-9 pr-9 text-sm text-slate-800 placeholder-slate-600/80 shadow-sm outline-none transition focus:border-teal-700 focus:bg-white/75 focus:ring-2 focus:ring-teal-700/25"
                  required={!quickUnlockActive}
                />
                {!quickUnlockActive && <button
                  type="button"
                  aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-600 transition hover:text-teal-800"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>}
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handlePrimaryAction()}
              disabled={isSubmitting || !authReady}
              aria-label="Masuk ke SIPANDU dengan username dan password atau biometrik yang telah diaktifkan"
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-[#1769AA] px-3 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(23,105,170,0.25)] transition hover:-translate-y-0.5 hover:bg-[#104C80] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span>{!authReady ? 'Memulihkan sesi…' : (isSubmitting ? 'Memeriksa akun…' : (quickUnlockActive ? 'Masuk dengan biometrik' : 'Masuk'))}</span>
              {quickUnlockActive ? <Fingerprint className="h-5 w-5" aria-hidden="true" /> : <ArrowRight className="h-5 w-5" aria-hidden="true" />}
            </button>
            <p className="mt-2 text-center text-[11px] font-semibold text-black">
              Belum memiliki akun?{' '}
              <a href="#buat-akun" onClick={(event) => { event.preventDefault(); setRegistrationNotice(''); setShowRegistration(true); }} className="underline decoration-black/50 underline-offset-2">Buat akun</a>
            </p>
          </form>

          {registrationNotice && <p role="status" className="mt-2 rounded-lg border border-emerald-700/30 bg-emerald-50/90 p-2 text-center text-[11px] font-medium text-black">{registrationNotice}</p>}

          {quickUnlockUser && isBiometricLockEnabled(quickUnlockUser.uid) && !forcePasswordLogin && (
            <button
              type="button"
              onClick={() => { setForcePasswordLogin(true); setErrorMsg(''); }}
              className="mt-2 w-full rounded-lg px-3 py-2 text-[11px] font-semibold text-black underline decoration-black/40 underline-offset-2 transition hover:bg-white/25"
            >
              Gunakan email dan kata sandi
            </button>
          )}
          {forcePasswordLogin && quickUnlockUser && isBiometricLockEnabled(quickUnlockUser.uid) && (
            <button
              type="button"
              onClick={() => { setForcePasswordLogin(false); setErrorMsg(''); }}
              className="mt-2 w-full rounded-lg px-3 py-2 text-[11px] font-semibold text-black underline decoration-black/40 underline-offset-2 transition hover:bg-white/25"
            >
              Kembali ke biometrik
            </button>
          )}

          {/* Buka cepat stays within the existing login card; no separate biometric page. */}
          {/* Footer berada di dalam card, tepat di bawah tombol masuk. */}
          <footer className="mt-4 border-t border-slate-300/60 pt-3 text-center">
            <p className="text-[10px] font-medium leading-snug text-slate-500">
              © 2026 - Kementerian Sosial RI - SIPANDU
            </p>
            <p className="mt-1 text-[9px] leading-relaxed text-slate-500">
              Direktorat Rehabilitasi Sosial Korban Penyalahgunaan Narkoba &amp; ODHIV
            </p>
          </footer>
        </section>
      </main>
    </div>
    </>
  );
};
