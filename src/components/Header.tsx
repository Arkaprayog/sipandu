import React, { useState, useEffect } from 'react';
import { ProfileUser } from '../types';
import { getWaktuGreeting } from '../utils/helpers';
import { Bell, Settings, LogOut, Edit3, ShieldAlert, Cloud, User } from 'lucide-react';
import { SipanduLogo } from './SipanduLogo';

interface HeaderProps {
  currentUser: string;
  activeTab?: string;
  profile: ProfileUser;
  accountPhotoUrl?: string | null;
  unreadNotificationsCount?: number;
  onOpenEditProfile: () => void;
  onOpenSettings: () => void;
  onOpenNotifications: () => void;
  onOpenGoogleWorkspace?: () => void;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab = '',
  profile,
  accountPhotoUrl,
  unreadNotificationsCount = 3,
  onOpenEditProfile,
  onOpenSettings,
  onOpenNotifications,
  onOpenGoogleWorkspace,
  onLogout,
}) => {
  const [currentTimeStr, setCurrentTimeStr] = useState<string>('');
  const [greeting, setGreeting] = useState<string>('Pagi');
  const [failedProfilePhotoUrls, setFailedProfilePhotoUrls] = useState<string[]>([]);
  const headerPhotoUrl = [profile.photoUrl, accountPhotoUrl]
    .find((url) => Boolean(url) && !failedProfilePhotoUrls.includes(url as string)) || '';

  useEffect(() => {
    setFailedProfilePhotoUrls([]);
  }, [profile.photoUrl, accountPhotoUrl]);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setGreeting(getWaktuGreeting(now));
      // Format: HH:mm:ss WIB
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      setCurrentTimeStr(`${hours}:${minutes}:${seconds} WIB`);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="app-header-safe-area relative w-full bg-[#112214]/90 border-b border-rose-500/35 shadow-[0_4px_20px_rgba(244,63,94,0.12)] px-3 pb-2 md:px-6 select-none z-20">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-2">
        {/* Left Side: Greeting & Profil Pengguna */}
        <div className="flex flex-col gap-1.5">
          {/* Greeting hanya menampilkan salam dan jam live; email akun tidak ditampilkan. */}
          <div className="flex items-center gap-2 text-xs md:text-sm">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold text-sky-200">
              Selamat {greeting} ({currentTimeStr})
            </span>
          </div>

          {/* Profil pengguna (di pojok kiri atas) */}
          <div className="flex items-start gap-2.5 pt-0.5">
            {/* Foto profil + tombol Edit di bawahnya */}
            <div className="flex flex-col items-center">
              <div className="relative w-12 h-12 md:w-14 md:h-14 rounded-full p-0.5 border-2 border-rose-500/50 shadow-[0_0_12px_rgba(244,63,94,0.3)] bg-black/40 overflow-hidden">
                {headerPhotoUrl ? (
                  <img
                    src={headerPhotoUrl}
                    alt={profile.nama || 'Foto profil petugas'}
                    className="w-full h-full object-cover rounded-full"
                    onError={() => setFailedProfilePhotoUrls((failed) =>
                      failed.includes(headerPhotoUrl) ? failed : [...failed, headerPhotoUrl]
                    )}
                  />
                ) : (
                  <div className="w-full h-full rounded-full flex items-center justify-center bg-emerald-950/80" aria-label="Foto profil belum tersedia">
                    <User className="h-7 w-7 text-sky-200" />
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={onOpenEditProfile}
                className="mt-1 inline-flex items-center gap-1 text-[9px] md:text-xs text-sky-300 hover:text-sky-100 hover:underline transition font-medium cursor-pointer"
                title="Buka Menu Edit Profil"
              >
                <Edit3 className="w-3 h-3 text-sky-300" />
                <span>Edit</span>
              </button>
            </div>

            {/* Di samping foto profil (sejajar): nama, NIP, dan unit kerja */}
            <div className="flex flex-col justify-center text-left space-y-0.5">
              <h2 className="text-sm md:text-base font-bold text-white tracking-wide flex items-center gap-2">
                <span>{profile.nama}</span>
                {profile.jabatan.includes('Pendamping') && (
                  <span className="text-[10px] bg-emerald-800/80 text-emerald-200 px-2 py-0.5 rounded border border-emerald-500/40">
                    Pendamping
                  </span>
                )}
              </h2>
              <p className="text-xs text-neutral-300 font-mono tracking-tight">
                <span className="text-sky-300/80">NIP:</span> {profile.nip}
              </p>
              <p className="text-[11px] md:text-xs text-emerald-200/90 leading-tight max-w-xl">
                <span className="text-sky-300/80">Unit Kerja:</span> {profile.unitKerja}
              </p>
            </div>
          </div>
        </div>

        {/* Right Side: Logo SIPANDU & 3 Icon (Lonceng Notifikasi, Gear Pengaturan, Pintu Keluar) */}
        <div className="flex items-center justify-between md:justify-end gap-2 self-end md:self-center">
          <div className={`hidden lg:block app-header-sipandu-brand ${activeTab === 'beranda' ? 'app-header-sipandu-brand-home' : ''}`}>
            <SipanduLogo size="sm" />
          </div>

          {/* The 3 icons */}
          <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-rose-500/35 shadow-[0_0_15px_rgba(244,63,94,0.15)]">
            {/* 1. Lonceng Notifikasi */}
            <button
              type="button"
              onClick={onOpenNotifications}
              className="relative p-2 rounded-lg text-neutral-300 hover:text-white hover:bg-emerald-950/60 active:scale-95 transition cursor-pointer"
              title="Notifikasi & Peringatan Asesmen"
              aria-label="Lonceng Notifikasi"
            >
              <Bell className="w-5 h-5 text-sky-300 hover:text-sky-100" />
              {unreadNotificationsCount > 0 && (
                <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-[9px] font-bold text-white shadow-sm ring-1 ring-black">
                  {unreadNotificationsCount}
                </span>
              )}
            </button>

            {/* Google Workspace & Cloud Hub */}
            {onOpenGoogleWorkspace && (
              <button
                type="button"
                onClick={onOpenGoogleWorkspace}
                className="p-2 rounded-lg text-neutral-300 hover:text-white hover:bg-emerald-950/60 active:scale-95 transition cursor-pointer"
                title="Google Workspace & Cloud Hub (Drive, Sheets, Forms, Firebase)"
                aria-label="Google Workspace dan Cloud"
              >
                <Cloud className="w-5 h-5 text-emerald-400 hover:text-emerald-200" />
              </button>
            )}

            {/* 2. Gear Pengaturan */}
            <button
              type="button"
              onClick={onOpenSettings}
              className="p-2 rounded-lg text-neutral-300 hover:text-white hover:bg-emerald-950/60 active:scale-95 transition cursor-pointer"
              title="Pengaturan Integrasi Google & WhatsApp"
              aria-label="Gear Pengaturan"
            >
              <Settings className="w-5 h-5 text-sky-300 hover:text-sky-100" />
            </button>

            {/* 3. Pintu untuk Keluar */}
            <button
              type="button"
              onClick={onLogout}
              className="p-2 rounded-lg text-rose-300 hover:text-rose-100 hover:bg-rose-950/50 active:scale-95 transition cursor-pointer"
              title="Keluar dari Aplikasi (Logout)"
              aria-label="Pintu Keluar"
            >
              <LogOut className="w-5 h-5 text-rose-400 hover:text-rose-200" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
