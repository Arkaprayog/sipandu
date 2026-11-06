import React, { useState, useEffect } from 'react';
import { ProfileUser } from '../types';
import { Bell, Settings, LogOut, Edit3, Cloud, User, Sunrise, Sun, Sunset, Moon, MapPin, Thermometer } from 'lucide-react';
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
  const [locationStatus, setLocationStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [weatherStatus, setWeatherStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [locationLabel, setLocationLabel] = useState<string>('');
  const [temperature, setTemperature] = useState<number | null>(null);
  const [failedProfilePhotoUrls, setFailedProfilePhotoUrls] = useState<string[]>([]);
  const headerPhotoUrl = [profile.photoUrl, accountPhotoUrl]
    .find((url) => Boolean(url) && !failedProfilePhotoUrls.includes(url as string)) || '';
  const compactPageTitles: Record<string, string> = {
    'database-ppks': 'DATABASE PPKS',
    asesmen: 'ASESMEN',
    'from-asesmen-terintegrasi': 'FORM ASESMEN TERINTEGRASI',
    dokumen: 'DOKUMEN',
  };
  const isCompactDashboard = Boolean(compactPageTitles[activeTab]);

  useEffect(() => {
    setFailedProfilePhotoUrls([]);
  }, [profile.photoUrl, accountPhotoUrl]);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(now);
      const part = (type: string) => parts.find((item) => item.type === type)?.value || '00';
      const hour = Number(part('hour'));
      setGreeting(hour >= 5 && hour < 11 ? 'Pagi' : hour >= 11 && hour < 15 ? 'Siang' : hour >= 15 && hour < 18 ? 'Sore' : 'Malam');
      setCurrentTimeStr(`${part('hour')}:${part('minute')}:${part('second')} WIB`);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Lokasi diminta melalui izin GPS perangkat. Koordinat hanya digunakan
  // untuk mengambil nama wilayah dan suhu saat ini; tidak disimpan ke akun SIPANDU.
  useEffect(() => {
    let active = true;
    let requestInProgress = false;

    const requestLocationAndWeather = () => {
      if (!active || requestInProgress) return;
      if (!navigator.geolocation) {
        setLocationStatus('unavailable');
        setWeatherStatus('unavailable');
        return;
      }

      requestInProgress = true;
      navigator.geolocation.getCurrentPosition(({ coords }) => {
        if (!active) {
          requestInProgress = false;
          return;
        }

        const query = `latitude=${encodeURIComponent(String(coords.latitude))}&longitude=${encodeURIComponent(String(coords.longitude))}`;
        const controller = new AbortController();
        const requestTimeout = window.setTimeout(() => controller.abort(), 15000);

        // Nama wilayah dan suhu dimuat secara independen. Kegagalan satu layanan
        // tidak menyembunyikan hasil dari layanan yang lain.
        const placeRequest = fetch(
          `https://api.bigdatacloud.net/data/reverse-geocode-client?${query}&localityLanguage=id`,
          { signal: controller.signal }
        ).then(async (response) => {
          if (!response.ok) throw new Error(`Layanan lokasi HTTP ${response.status}`);
          const place = await response.json();
          const administrative = Array.isArray(place.localityInfo?.administrative)
            ? place.localityInfo.administrative
            : [];
          const municipality = administrative.find((item: any) =>
            /city|municipality|regency|kota|kabupaten/i.test(String(item.description || ''))
          )?.name;
          const district = administrative.find((item: any) =>
            /district|subdistrict|kecamatan/i.test(String(item.description || ''))
          )?.name;
          const candidates = [
            place.locality,
            place.city,
            municipality,
            district,
            administrative[0]?.name,
            place.principalSubdivision,
          ];
          const name = candidates.find((candidate) =>
            typeof candidate === 'string' && candidate.trim().length > 0
          );
          if (!name) throw new Error('Nama wilayah tidak tersedia dari layanan lokasi.');
          if (active) {
            setLocationLabel(name.trim());
            setLocationStatus('ready');
          }
        }).catch((error) => {
          if (active) {
            setLocationStatus('unavailable');
            console.warn('SIPANDU: lokasi saat ini belum berhasil dimuat.', error);
          }
        });

        const weatherRequest = fetch(
          `https://api.open-meteo.com/v1/forecast?${query}&current=temperature_2m&timezone=Asia%2FJakarta`,
          { signal: controller.signal }
        ).then(async (response) => {
          if (!response.ok) throw new Error(`Layanan suhu HTTP ${response.status}`);
          const weather = await response.json();
          const rawTemperature = weather.current?.temperature_2m;
          const value = typeof rawTemperature === 'number' ? rawTemperature : Number(rawTemperature);
          if (rawTemperature === null || rawTemperature === undefined || !Number.isFinite(value)) {
            throw new Error('Data suhu saat ini tidak tersedia.');
          }
          if (active) {
            setTemperature(value);
            setWeatherStatus('ready');
          }
        }).catch((error) => {
          if (active) {
            setWeatherStatus('unavailable');
            console.warn('SIPANDU: suhu saat ini belum berhasil dimuat.', error);
          }
        });

        void Promise.allSettled([placeRequest, weatherRequest]).finally(() => {
          window.clearTimeout(requestTimeout);
          requestInProgress = false;
        });
      }, (error) => {
        requestInProgress = false;
        if (!active) return;
        setLocationStatus('unavailable');
        setWeatherStatus('unavailable');
        console.warn('SIPANDU: posisi GPS belum berhasil diperoleh.', error.message);
      }, {
        enableHighAccuracy: false,
        timeout: 12000,
        maximumAge: 5 * 60 * 1000,
      });
    };

    const refreshWhenOnline = () => requestLocationAndWeather();
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') requestLocationAndWeather();
    };

    requestLocationAndWeather();
    const refreshInterval = window.setInterval(requestLocationAndWeather, 30 * 60 * 1000);
    window.addEventListener('online', refreshWhenOnline);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      active = false;
      window.clearInterval(refreshInterval);
      window.removeEventListener('online', refreshWhenOnline);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, []);

  return (
    <header className={`app-header-safe-area relative w-full bg-[#112214]/90 border-b border-rose-500/35 shadow-[0_4px_20px_rgba(244,63,94,0.12)] px-3 pb-2 md:px-6 select-none z-20 ${isCompactDashboard ? 'app-header-compact' : ''}`}>
      <div className={`max-w-7xl mx-auto flex ${isCompactDashboard ? 'flex-row items-center justify-between gap-3' : 'flex-col md:flex-row md:items-center justify-between gap-2'}`}>
        {!isCompactDashboard ? (
        <div className="flex flex-col gap-1.5">
          {/* Salam, jam WIB, lokasi, dan suhu ditampilkan ringkas dalam satu baris. */}
          <div
            className="flex w-full min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto whitespace-nowrap text-[10px] sm:gap-2 sm:text-xs md:text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-live="off"
          >
            {greeting === 'Pagi' ? (
              <Sunrise className="h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
            ) : greeting === 'Siang' ? (
              <Sun className="h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
            ) : greeting === 'Sore' ? (
              <Sunset className="h-4 w-4 shrink-0 text-orange-300" aria-hidden="true" />
            ) : (
              <Moon className="h-4 w-4 shrink-0 text-sky-300" aria-hidden="true" />
            )}
            <span className="shrink-0 font-semibold text-sky-200">Selamat {greeting}</span>
            <span className="shrink-0 font-semibold tabular-nums text-sky-200">{currentTimeStr}</span>
            <span className="mx-0.5 h-3 w-px shrink-0 bg-white/25" aria-hidden="true" />
            <MapPin className="h-3 w-3 shrink-0 text-emerald-300" aria-hidden="true" />
            <span
              className="max-w-[78px] shrink-0 truncate text-neutral-200 sm:max-w-[110px]"
              title={locationLabel || (locationStatus === 'loading' ? 'Sedang mencari lokasi' : 'Lokasi tidak tersedia')}
            >
              {locationLabel || (locationStatus === 'loading' ? 'Mencari…' : 'Tidak tersedia')}
            </span>
            <span className="mx-0.5 h-3 w-px shrink-0 bg-white/25" aria-hidden="true" />
            <Thermometer className="h-3 w-3 shrink-0 text-orange-300" aria-hidden="true" />
            <span
              className="shrink-0 font-medium tabular-nums text-neutral-200"
              title={weatherStatus === 'unavailable' ? 'Data suhu saat ini belum tersedia' : 'Suhu saat ini'}
            >
              {temperature !== null ? `${Math.round(temperature)}°C` : weatherStatus === 'loading' ? 'Memuat…' : '—°C'}
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
              <h2 className="text-sm md:text-base font-bold text-white tracking-wide flex flex-wrap items-center gap-2 min-w-0">
                <span>{profile.nama}</span>
                {String(profile.jabatan || '').trim() && (
                  <span className="profile-role-badge inline-flex max-w-full items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold leading-snug md:text-[11px]" aria-label={`Jabatan: ${profile.jabatan}`}>
                    {String(profile.jabatan).trim()}
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
        ) : (
          <div className="flex min-w-0 items-center gap-2.5 py-0.5">
            <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.65)]" />
            <span className="truncate text-[11px] font-extrabold tracking-[0.12em] text-emerald-100 sm:text-xs">
              {compactPageTitles[activeTab]}
            </span>
          </div>
        )}

        {/* Right Side: Logo SIPANDU & 3 Icon (Lonceng Notifikasi, Gear Pengaturan, Pintu Keluar) */}
        <div className={`flex items-center justify-between md:justify-end gap-2 ${isCompactDashboard ? 'ml-auto self-center' : 'self-end md:self-center'}`}>
          {!isCompactDashboard && (
            <div className={`hidden lg:block app-header-sipandu-brand ${activeTab === 'beranda' ? 'app-header-sipandu-brand-home' : ''}`}>
              <SipanduLogo size="sm" />
            </div>
          )}

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
