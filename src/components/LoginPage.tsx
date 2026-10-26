import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { KemensosLogo } from './KemensosLogo';
import { auth } from '../lib/firebase';
import { Lock, User, Eye, EyeOff, ArrowRight, ShieldCheck } from 'lucide-react';

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
    <div className="relative min-h-screen w-full flex flex-col justify-between items-center bg-[#0d170e] text-white p-4 md:p-6 overflow-hidden">
      <div aria-hidden="true" className="absolute inset-0 bg-cover bg-center bg-no-repeat" style={{ backgroundImage: `url("${import.meta.env.BASE_URL}uploads/Wallpaper%20Background%20Landingpage.jpg")` }} />
      <div aria-hidden="true" className="absolute inset-0 bg-[#07110b]/55 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-[#0d170e]/30 to-[#080d09]/75 pointer-events-none" />
      <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-rose-600/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-emerald-600/10 blur-3xl pointer-events-none" />

      <header className="relative z-10 w-full max-w-5xl flex items-center justify-between py-2 border-b border-rose-500/20">
        <KemensosLogo size="sm" />
        <div className="hidden sm:flex items-center gap-2 text-xs text-sky-300">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Autentikasi SIPANDU</span>
        </div>
      </header>

      <main className="relative z-10 w-full max-w-lg my-auto py-6">
        <div className="w-full bg-black/25 rounded-2xl p-6 md:p-8 border border-rose-500/40 shadow-[0_0_25px_rgba(244,63,94,0.18)]">
          <div className="flex flex-col items-center text-center space-y-1.5 mb-6">
            <div className="p-2 rounded-xl bg-black/40 border border-emerald-500/30 mb-1">
              <KemensosLogo size="md" showText={false} />
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-wider text-white">SIPANDU ODHIV</h1>
            <p className="text-xs md:text-sm font-semibold text-emerald-300 tracking-wide">Sistem Informasi &amp; Pendampingan Terpadu</p>
            <p className="text-[11px] md:text-xs text-neutral-300/90 leading-snug">Layanan Terintegrasi Database PPKS ODHIV Sumatera Utara</p>
          </div>

          {errorMsg && (
            <div role="alert" className="mb-4 p-3 rounded-lg bg-red-950/70 border border-red-500/50 text-red-200 text-xs text-center font-medium">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="sipandu-email" className="block text-xs font-semibold text-sky-200 mb-1.5">Email akun resmi</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-400"><User className="w-4 h-4 text-sky-300" /></div>
                <input id="sipandu-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@instansi.go.id" className="w-full pl-10 pr-4 py-3 rounded-lg bg-black/40 border border-rose-500/30 text-white placeholder-neutral-500 text-sm focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400 transition" required />
              </div>
            </div>
            <div>
              <label htmlFor="sipandu-password" className="block text-xs font-semibold text-sky-200 mb-1.5">Kata sandi</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-400"><Lock className="w-4 h-4 text-sky-300" /></div>
                <input id="sipandu-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Masukkan kata sandi" className="w-full pl-10 pr-10 py-3 rounded-lg bg-black/40 border border-rose-500/30 text-white placeholder-neutral-500 text-sm focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400 transition" required />
                <button type="button" aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'} onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-400 hover:text-neutral-200">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={isSubmitting} className="w-full mt-2 py-3 px-4 rounded-xl font-bold text-sm tracking-wider uppercase text-white bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-800 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-60 transition border border-rose-500/50 shadow-[0_0_15px_rgba(244,63,94,0.25)] flex items-center justify-center gap-2">
              <span>{isSubmitting ? 'Memeriksa akun…' : 'Masuk Aplikasi'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </main>

      <footer className="relative z-10 w-full max-w-5xl text-center py-3 border-t border-rose-500/20">
        <p className="text-xs font-semibold text-neutral-200 tracking-wide">© 2026 - Kementerian Sosial RI - DRSKPNO</p>
        <p className="text-xs font-semibold text-neutral-200 tracking-wide mt-1">Hak Cipta Kementerian Sosial RI</p>
        <p className="text-[11px] text-neutral-400 mt-0.5">Direktorat Rehabilitasi Sosial Korban Penyalahgunaan Narkoba &amp; ODHIV</p>
      </footer>
    </div>
  );
};
