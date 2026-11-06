import React, { useState, useEffect, useRef } from 'react';
import { ProfileUser } from '../types';
import { Bell, Settings, LogOut, Edit3, Cloud, User, Sunrise, Sun, Sunset, Moon, MapPin, Thermometer } from 'lucide-react';
import { SipanduLogo } from './SipanduLogo';
import { getPreciseDevicePosition } from '../lib/deviceGeolocation';

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
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [locationError, setLocationError] = useState<string>('');
  const locationRefreshRef = useRef<(() => void) | null>(null);
  const [weatherStatus, setWeatherStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [weatherError, setWeatherError] = useState<string>('');
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

  // Lokasi GPS presisi diminta melalui plugin Capacitor. Pada APK plugin
  // menggunakan izin native ACCESS_FINE_LOCATION; pada PWA Android/iOS plugin
  // meneruskan permintaan ke Geolocation browser dengan high accuracy.
  useEffect(() => {
    let active = true;
    let requestInProgress = false;

    const fetchJson = async (url: string, timeoutMs: number): Promise<any> => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
          throw new Error('Layanan mengembalikan HTTP ' + response.status + '.');
        }
        return await response.json();
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('Layanan tidak merespons sebelum batas waktu.');
        }
        throw error;
      } finally {
        window.clearTimeout(timeout);
      }
    };

    const requestLocationAndWeather = async () => {
      if (!active || requestInProgress) return;
      requestInProgress = true;
      setLocationStatus('loading');
      setWeatherStatus('loading');
      setLocationError('');
      setWeatherError('');

      try {
        const position = await getPreciseDevicePosition();
        if (!active) return;

        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        const accuracy = position.coords.accuracy;
        const query = 'latitude=' + encodeURIComponent(String(latitude)) +
          '&longitude=' + encodeURIComponent(String(longitude));

        // Koordinat GPS adalah hasil lokasi yang valid. Tampilkan segera agar
        // gangguan reverse-geocoding tidak membuat lokasi ikut hilang.
        setLocationLabel(latitude.toFixed(5) + ', ' + longitude.toFixed(5));
        setLocationAccuracy(accuracy);
        setLocationStatus('ready');

        const results = await Promise.allSettled([
          fetchJson(
            'https://api.bigdatacloud.net/data/reverse-geocode-client?' + query + '&localityLanguage=id',
            12000
          ),
          fetchJson(
            'https://api.open-meteo.com/v1/forecast?' + query + '&current=temperature_2m&timezone=Asia%2FJakarta',
            15000
          ),
        ]);

        if (!active) return;
        const placeResult = results[0];
        const weatherResult = results[1];

        if (placeResult.status === 'fulfilled') {
          const place = placeResult.value;
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
          if (name) {
            setLocationLabel(String(name).trim());
          } else {
            setLocationError('Nama wilayah belum tersedia; koordinat GPS tetap ditampilkan.');
          }
        } else {
          const reason = placeResult.reason;
          const detail = reason instanceof Error ? reason.message : String(reason);
          setLocationError('Nama wilayah belum dapat dimuat (' + detail + '); koordinat GPS tetap ditampilkan.');
          console.warn('SIPANDU: reverse geocoding gagal; koordinat GPS tetap tersedia.', reason);
        }

        if (weatherResult.status === 'fulfilled') {
          const weather = weatherResult.value;
          const rawTemperature = weather.current?.temperature_2m;
          const value = typeof rawTemperature === 'number' ? rawTemperature : Number(rawTemperature);
          if (rawTemperature === null || rawTemperature === undefined || !Number.isFinite(value)) {
            setWeatherStatus('unavailable');
            setWeatherError('Layanan cuaca tidak mengembalikan suhu saat ini.');
          } else {
            setTemperature(value);
            setWeatherStatus('ready');
          }
        } else {
          const reason = weatherResult.reason;
          const detail = reason instanceof Error ? reason.message : String(reason);
          setWeatherStatus('unavailable');
          setWeatherError('Suhu saat ini belum dapat dimuat: ' + detail);
          console.warn('SIPANDU: pengambilan suhu gagal.', reason);
        }
      } catch (error) {
        if (!active) return;
        const message = error instanceof Error ? error.message : String(error);
        setLocationStatus('unavailable');
        setLocationError(message);
        setWeatherStatus('unavailable');
        setWeatherError('Suhu menunggu koordinat GPS yang valid.');
        console.warn('SIPANDU: lokasi presisi belum berhasil diperoleh.', error);
      } finally {
        requestInProgress = false;
      }
    };

    // Tombol di header memanggil fungsi ini langsung dari sentuhan pengguna,
    // penting untuk PWA iOS yang dapat membatasi dialog izin tanpa user gesture.
    locationRefreshRef.current = () => {
      void requestLocationAndWeather();
    };

    const refreshWhenOnline = () => {
      void requestLocationAndWeather();
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void requestLocationAndWeather();
    };

    void requestLocationAndWeather();
    const refreshInterval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void requestLocationAndWeather();
    }, 30 * 60 * 1000);
    window.addEventListener('online', refreshWhenOnline);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      active = false;
      locationRefreshRef.current = null;
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
            <button
              type="button"
              onClick={() => locationRefreshRef.current?.()}
              disabled={locationStatus === 'loading'}
              className="inline-flex shrink-0 items-center gap-1 rounded-md px-1 py-0.5 text-neutral-200 hover:bg-white/10 disabled:cursor-wait disabled:opacity-75"
              title={locationError || 'Tekan untuk meminta lokasi GPS presisi terbaru'}
              aria-label={locationError || 'Perbarui lokasi GPS SIPANDU'}
            >
              <MapPin className="h-3 w-3 shrink-0 text-emerald-300" aria-hidden="true" />
              <span className="max-w-[110px] truncate">
                {locationStatus === 'loading'
                  ? 'Mencari GPS…'
                  : locationStatus === 'unavailable'
                    ? 'Coba lagi'
                    : locationLabel}
              </span>
              {locationStatus === 'ready' && locationAccuracy !== null && (
                <span className="shrink-0 text-[9px] tabular-nums text-emerald-200/90" title="Perkiraan radius akurasi koordinat GPS">
                  ±{Math.round(locationAccuracy)}m
                </span>
              )}
            </button>
            <span className="mx-0.5 h-3 w-px shrink-0 bg-white/25" aria-hidden="true" />
            <Thermometer className="h-3 w-3 shrink-0 text-orange-300" aria-hidden="true" />
            <span
              className="shrink-0 font-medium tabular-nums text-neutral-200"
              title={weatherError || 'Suhu udara saat ini berdasarkan koordinat lokasi perangkat'}
            >
              {temperature !== null ? Math.round(temperature) + '°C' : weatherStatus === 'loading' ? 'Memuat…' : '—°C'}
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
