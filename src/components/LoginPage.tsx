import React, { useRef, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, sendEmailVerification, signOut, type User as FirebaseUser } from 'firebase/auth';
import { auth, staffAuthPersistenceReady } from '../lib/firebase';
import { authenticateBiometricLock, isAppPinConfigured, isBiometricLockEnabled, verifyAppPin } from '../lib/biometricLock';
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
  const [quickPin, setQuickPin] = useState('');
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
        setErrorMsg(`Biometrik belum berhasil. ${message} Pilih “Gunakan email dan kata sandi” untuk cara masuk alternatif.`);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }
    // Preserve browser validation and the existing email/password login flow.
    formRef.current?.requestSubmit();
  };

  const handleQuickPin = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentUser = restoredUser || auth.currentUser;
    if (!currentUser || !isAppPinConfigured(currentUser.uid)) {
      setErrorMsg('Sesi akun tidak tersedia untuk membuka dengan PIN. Masuk menggunakan email dan kata sandi.');
      return;
    }
    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const result = await verifyAppPin(quickPin, currentUser.uid);
      if (!result.ok) {
        setErrorMsg(result.message || 'PIN SIPANDU belum dapat diverifikasi.');
        if (result.retryAfterMs) setQuickPin('');
        return;
      }
      setQuickPin('');
      onLogin(currentUser.displayName || currentUser.email || 'Pengguna SIPANDU');
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'PIN SIPANDU belum dapat diverifikasi.');
    } finally {
      setIsSubmitting(false);
    }
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
        await sendEmailVerification(credential.user);
        await signOut(auth);
        setRegistrationNotice('Email akun belum terverifikasi. Tautan verifikasi baru telah dikirim. Buka email tersebut, verifikasi akun, lalu masuk kembali.');
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
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-x-hidden px-3 py-5 text-slate-800 min-[900px]:px-7 min-[900px]:py-7">
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
      <main className="relative z-10 mx-auto grid w-full max-w-[800px] grid-cols-1 items-stretch gap-0 overflow-hidden rounded-3xl border border-white/70 bg-white/[0.16] shadow-2xl backdrop-blur-[24px] min-[720px]:grid-cols-2">
        <section className="relative flex min-w-0 flex-col justify-between p-5 min-[720px]:p-6">
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/55 via-slate-950/45 to-slate-950/85" />
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

        <section className="w-full min-w-0 bg-white/[0.82] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-[22px] min-[720px]:flex min-[720px]:flex-col min-[720px]:justify-center min-[720px]:rounded-none min-[720px]:px-5 min-[720px]:py-5">
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
                Username
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
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-blue-600 to-blue-500 px-3 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(59,76,210,0.28)] transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span>{!authReady ? 'Memulihkan sesi…' : (isSubmitting ? 'Memeriksa akun…' : (quickUnlockActive ? 'Masuk dengan biometrik' : 'Masuk'))}</span>
              {quickUnlockActive ? <Fingerprint className="h-5 w-5" aria-hidden="true" /> : <ArrowRight className="h-5 w-5" aria-hidden="true" />}
            </button>
            <p className="mt-2 text-center text-[11px] font-semibold text-black">
              Sudah memiliki akun?{' '}
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
          {quickUnlockUser && isAppPinConfigured(quickUnlockUser.uid) && (
            <form
              onSubmit={(event) => void handleQuickPin(event)}
              className="mt-3 rounded-xl border border-white/55 bg-white/30 p-2.5"
            >
              <label htmlFor="sipandu-login-quick-pin" className="mb-1.5 block text-[10px] font-semibold text-black">
                Atau buka dengan PIN SIPANDU
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="sipandu-login-quick-pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{4}"
                  maxLength={4}
                  value={quickPin}
                  onChange={(event) => setQuickPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="4 angka"
                  aria-label="PIN SIPANDU empat angka"
                  className="min-w-0 flex-1 rounded-lg border border-white bg-white/70 px-3 py-2 text-center text-sm tracking-[0.35em] text-black outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20"
                  required
                />
                <button
                  type="submit"
                  disabled={isSubmitting || quickPin.length !== 4}
                  className="rounded-lg bg-slate-800 px-3 py-2 text-[10px] font-bold text-white transition hover:bg-slate-700 disabled:opacity-50"
                >
                  Buka
                </button>
              </div>
            </form>
          )}

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
  );
};
