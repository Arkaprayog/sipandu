import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { Lock, User, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { publicAssetUrl } from '../lib/publicAssets';

const LOGIN_TIMEOUT_MS = 18_000;

interface LoginPageProps {
  onLogin: (userName: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setIsSubmitting(true);
    let timeoutId: number | undefined;
    try {
      // A stalled mobile request must not leave the submit button disabled forever.
      const credential = await Promise.race([
        signInWithEmailAndPassword(auth, email.trim(), password),
        new Promise<never>((_, reject) => {
          timeoutId = window.setTimeout(() => {
            reject({ code: 'sipandu/login-timeout' });
          }, LOGIN_TIMEOUT_MS);
        }),
      ]);
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

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-x-hidden px-3 py-5 text-slate-800">
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
      <main className="relative z-10 w-[340px] max-w-[calc(100vw-24px)]">
        <section className="w-full rounded-2xl border border-white/80 bg-white/[0.24] p-5 shadow-[0_12px_40px_rgba(20,40,35,0.18),inset_0_1px_0_rgba(255,255,255,0.65)] backdrop-blur-[14px]">
          <div className="mb-4 flex flex-col items-center text-center">
            {logoFailed ? (
              <p className="mb-2 text-sm font-semibold text-black">Logo Kemensos Hadir tidak dapat dimuat</p>
            ) : (
              <img
                src={publicAssetUrl('uploads/Logo Kemensos Hadir.png')}
                alt="Logo resmi Kemensos Hadir"
                className="mb-2 h-auto w-[160px] max-w-full object-contain"
                loading="eager"
                decoding="async"
                onError={() => setLogoFailed(true)}
              />
            )}
            <h1 className="text-xl font-extrabold leading-tight tracking-wide text-black">
              SIPANDU ODHIV
            </h1>
            <p className="mt-1 text-[11px] font-semibold leading-snug text-black">
              Sistem Informasi &amp; Pendampingan Terpadu
            </p>
            <p className="mt-1 text-[10px] leading-snug text-black">
              Layanan Terintegrasi Database PPKS ODHIV Sumatera Utara
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

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label
                htmlFor="sipandu-email"
                className="mb-1 block text-xs font-semibold text-slate-800"
              >
                Email akun resmi
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-600">
                  <User className="h-4 w-4" />
                </div>
                <input
                  id="sipandu-email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@instansi.go.id"
                  className="w-full rounded-lg border border-white/90 bg-white/55 py-3 pl-9 pr-3 text-sm text-slate-800 placeholder-slate-600/80 shadow-sm outline-none transition focus:border-teal-700 focus:bg-white/75 focus:ring-2 focus:ring-teal-700/25"
                  required
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="sipandu-password"
                className="mb-1 block text-[11px] font-semibold text-black"
              >
                Kata sandi
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-black">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  id="sipandu-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan kata sandi"
                  className="w-full rounded-lg border border-white/90 bg-white/55 py-3 pl-9 pr-9 text-sm text-slate-800 placeholder-slate-600/80 shadow-sm outline-none transition focus:border-teal-700 focus:bg-white/75 focus:ring-2 focus:ring-teal-700/25"
                  required
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-600 transition hover:text-teal-800"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl border border-teal-700/70 bg-teal-700 px-3 py-3 text-sm font-bold uppercase tracking-wide text-white shadow-[0_6px_18px_rgba(15,118,110,0.28)] transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span>{isSubmitting ? 'Memeriksa akun…' : 'Masuk Aplikasi'}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          {/* Footer berada di dalam card, tepat di bawah tombol masuk. */}
          <footer className="mt-3 border-t border-white/45 pt-2 text-center">
            <p className="text-[9px] font-semibold leading-snug text-black">
              © 2026 - Kementerian Sosial RI - DRSKPNO
            </p>
            <p className="mt-1 text-[9px] font-semibold leading-snug text-black">
              Hak Cipta Kementerian Sosial RI
            </p>
            <p className="mt-1 text-[9px] leading-snug text-black">
              Direktorat Rehabilitasi Sosial Korban Penyalahgunaan Narkoba &amp; ODHIV
            </p>
          </footer>
        </section>
      </main>
    </div>
  );
};
