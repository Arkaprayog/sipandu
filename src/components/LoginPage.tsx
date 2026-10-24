import React, { useState } from 'react';
import { KemensosLogo } from './KemensosLogo';
import { FIXED_USER_ACCOUNTS } from '../data/initialData';
import { authenticateFixedUser } from '../utils/helpers';
import { UserAccount } from '../types';
import {
  Lock,
  User,
  Eye,
  EyeOff,
  ShieldCheck,
  ArrowRight,
  UserCheck,
  Check,
} from 'lucide-react';

interface LoginPageProps {
  onLogin: (userName: string, account?: UserAccount) => void;
  defaultUserName?: string;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  onLogin,
  defaultUserName = 'deny',
}) => {
  const [userName, setUserName] = useState<string>(defaultUserName);
  const [password, setPassword] = useState<string>('kemensos123');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [activeAccountIndex, setActiveAccountIndex] = useState<number>(0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName.trim()) {
      setErrorMsg('Nama user wajib diisi');
      return;
    }

    const authResult = authenticateFixedUser(userName, password, FIXED_USER_ACCOUNTS);
    if (!authResult.success) {
      setErrorMsg(authResult.error || 'Password atau nama pengguna tidak valid');
      return;
    }

    setErrorMsg('');
    if (authResult.account) {
      onLogin(authResult.account.displayName, authResult.account);
    } else {
      onLogin(userName.trim());
    }
  };

  const selectAccount = (index: number) => {
    setActiveAccountIndex(index);
    const target = FIXED_USER_ACCOUNTS[index];
    if (target) {
      setUserName(target.username);
      setPassword(target.password);
      setErrorMsg('');
    }
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col justify-between items-center bg-[#0d170e] text-white p-4 md:p-6 overflow-hidden select-none">
      {/* Background ambient moss-green & deep black gradient with subtle red silhouette aura */}
      <div className="absolute inset-0 bg-radial-[at_top_right] from-[#1f3a22]/70 via-[#0d170e] to-[#080d09] pointer-events-none" />
      <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-rose-600/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-emerald-600/10 blur-3xl pointer-events-none" />

      {/* Top bar branding */}
      <header className="relative z-10 w-full max-w-5xl flex items-center justify-between py-2 border-b border-rose-500/20">
        <KemensosLogo size="sm" />
        <div className="hidden sm:flex items-center gap-2 text-xs text-sky-300 font-mono">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Server Sumut - Terproteksi (2 Akun Resmi)</span>
        </div>
      </header>

      {/* Center login card - CRITICAL: SANGAT TRANSPARAN TIDAK MENGGUNAKAN EFEK BLUR */}
      <main className="relative z-10 w-full max-w-lg my-auto py-6">
        <div className="w-full bg-black/25 rounded-2xl p-6 md:p-8 border border-rose-500/40 shadow-[0_0_25px_rgba(244,63,94,0.18)] transition-all">
          {/* Header section in card */}
          <div className="flex flex-col items-center text-center space-y-1.5 mb-5">
            <div className="p-2 rounded-xl bg-black/40 border border-emerald-500/30 mb-1">
              <KemensosLogo size="md" showText={false} />
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-wider text-white">
              SIPANDU ODHIV
            </h1>
            <p className="text-xs md:text-sm font-semibold text-emerald-300 tracking-wide">
              Sistem Informasi & Pendampingan Terpadu
            </p>
            <p className="text-[11px] md:text-xs text-neutral-300/90 leading-snug">
              Layanan Terintegrasi Database PPKS ODHIV Sumatera Utara
            </p>
          </div>

          {/* 2 Fix Akun Selection Cards */}
          <div className="mb-5 space-y-2">
            <label className="block text-[11px] font-bold text-sky-200 uppercase tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-sky-300" />
                Pilih 2 Akun Resmi Tersedia:
              </span>
              <span className="text-[10px] text-emerald-300 font-normal">Klik untuk mengisi</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {FIXED_USER_ACCOUNTS.map((acc, idx) => {
                const isSelected = userName.toLowerCase() === acc.username.toLowerCase() || userName === acc.displayName;
                return (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => selectAccount(idx)}
                    className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex items-center gap-2.5 ${
                      isSelected
                        ? 'bg-[#15331b]/90 border-rose-500/60 shadow-[0_0_12px_rgba(244,63,94,0.25)]'
                        : 'bg-black/40 border-rose-500/25 hover:border-emerald-500/40 hover:bg-black/60'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full overflow-hidden border border-rose-500/40 shrink-0 bg-black">
                      <img
                        src={acc.photoUrl}
                        alt={acc.displayName}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1 leading-tight">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-white truncate">
                          {acc.displayName}
                        </span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 ml-1" />}
                      </div>
                      <span className="text-[10px] text-emerald-300 block font-medium truncate">
                        {acc.role}
                      </span>
                      <span className="text-[9px] text-sky-300 font-mono block">
                        Pass: {acc.password}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Error notification */}
          {errorMsg && (
            <div className="mb-4 p-3 rounded-lg bg-red-950/70 border border-red-500/50 text-red-200 text-xs text-center font-medium">
              {errorMsg}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-sky-200 mb-1.5">
                Halo, (nama user)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-400">
                  <User className="w-4 h-4 text-sky-300" />
                </div>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="Masukkan nama pengguna (e.g. deny / supriyanto)"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-black/40 border border-rose-500/30 text-white placeholder-neutral-400 text-sm focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400 transition"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-sky-200 mb-1.5">
                Password (minimal 6 karakter kombinasi angka)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-400">
                  <Lock className="w-4 h-4 text-sky-300" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Ketik password Anda"
                  className="w-full pl-10 pr-10 py-2.5 rounded-lg bg-black/40 border border-rose-500/30 text-white placeholder-neutral-400 text-sm focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400 transition font-mono"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-400 hover:text-neutral-200 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="mt-1 text-[10px] text-neutral-400 flex items-center gap-1">
                <span>Format:</span>
                <span className={password.length >= 6 ? 'text-emerald-400 font-medium' : ''}>
                  Min. 6 karakter
                </span>
                <span>•</span>
                <span className={/\d/.test(password) ? 'text-emerald-400 font-medium' : ''}>
                  Ada angka
                </span>
              </p>
            </div>

            <button
              type="submit"
              className="w-full mt-2 py-3 px-4 rounded-xl font-bold text-sm tracking-wider uppercase text-white bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-800 hover:from-emerald-700 hover:to-teal-700 active:scale-[0.99] transition border border-rose-500/50 shadow-[0_0_15px_rgba(244,63,94,0.25)] flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Masuk Aplikasi</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Quick Account Reference */}
          <div className="mt-4 pt-3 border-t border-rose-500/20 text-center text-[10px] text-neutral-400 space-y-0.5">
            <p className="text-sky-300 font-medium">Informasi Akun Tersedia:</p>
            <p>Akun 1: <strong className="text-white">deny</strong> / <code className="text-emerald-300">kemensos123</code> (Pendamping)</p>
            <p>Akun 2: <strong className="text-white">supriyanto</strong> / <code className="text-emerald-300">kemensos456</code> (Supervisor)</p>
          </div>
        </div>
      </main>

      {/* Footer legal Kemensos RI */}
      <footer className="relative z-10 w-full max-w-5xl text-center py-3 border-t border-rose-500/20">
        <p className="text-xs font-semibold text-neutral-200 tracking-wide">
          Hak Cipta Kementerian Sosial RI
        </p>
        <p className="text-[11px] text-neutral-400 mt-0.5">
          Direktorat Rehabilitasi Sosial Korban Penyalahgunaan Narkoba & ODHIV
        </p>
      </footer>
    </div>
  );
};
