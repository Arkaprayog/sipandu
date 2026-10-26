import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { Lock, User, Eye, EyeOff, ArrowRight } from 'lucide-react';

interface LoginPageProps {
  onLogin: (userName: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setIsSubmitting(true);
    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      onLogin(credential.user.displayName || credential.user.email || 'Pengguna SIPANDU');
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        setErrorMsg('Email atau kata sandi tidak sesuai.');
      } else if (code === 'auth/too-many-requests') {
        setErrorMsg('Terlalu banyak percobaan. Coba lagi nanti.');
      } else if (code === 'auth/operation-not-allowed') {
        setErrorMsg('Login email/kata sandi belum diaktifkan di Firebase Authentication.');
      } else {
        setErrorMsg('Login belum berhasil. Pastikan akun sudah dibuat dan konfigurasi Firebase benar.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-x-hidden px-3 py-5 text-black">
      {/* Gunakan foto gedung yang sudah tersedia; tanpa overlay, gradient, blur, atau efek glossy. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: `url("${import.meta.env.BASE_URL}uploads/Wallpaper%20Background%20Landingpage.jpg")`,
        }}
      />

      {/* Satu-satunya card di halaman login; lebar 300 px dan latar sangat transparan. */}
      <main className="relative z-10 w-[300px] max-w-[calc(100vw-24px)]">
        <section className="w-full rounded-xl border border-white/65 bg-white/[0.07] p-4 shadow-none">
          <div className="mb-4 flex flex-col items-center text-center">
            <img
              src={`${import.meta.env.BASE_URL}uploads/Logo%20Kemensos%20Hadir.png`}
              alt="Logo resmi Kementerian Sosial RI"
              className="mb-2 h-auto w-[96px] max-w-full object-contain"
              loading="eager"
            />
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
                className="mb-1 block text-[11px] font-semibold text-black"
              >
                Email akun resmi
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-black">
                  <User className="h-4 w-4" />
                </div>
                <input
                  id="sipandu-email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@instansi.go.id"
                  className="w-full rounded-md border border-black/45 bg-white/35 py-2.5 pl-9 pr-3 text-xs text-black placeholder-black/65 transition focus:border-black focus:outline-none"
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
                  className="w-full rounded-md border border-black/45 bg-white/35 py-2.5 pl-9 pr-9 text-xs text-black placeholder-black/65 transition focus:border-black focus:outline-none"
                  required
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-black"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg border border-black/45 bg-white/45 px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-black transition hover:bg-white/65 disabled:opacity-60"
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
              Direktorat Rehabilitasi Sosial Korban Penyalahgunaan Narkoba
            </p>
          </footer>
        </section>
      </main>
    </div>
  );
};
