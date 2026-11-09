import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Fingerprint,
  Moon,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sun,
  X,
} from 'lucide-react';
import {
  disableBiometricLock,
  enableBiometricLock,
  getBiometricDiagnostics,
  isBiometricLockEnabled,
  type BiometricDiagnostics,
} from '../lib/biometricLock';
import { Capacitor } from '@capacitor/core';
import { auth } from '../lib/firebase';
import { enableRespondentNotifications, refreshRespondentNotificationPermission } from '../lib/respondentNotifications';
import { AppSettings } from '../types';
import { detectPwaRuntimeCapabilities } from '../lib/platformCompatibility';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (updated: AppSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, onSave }) => {
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [biometricDiagnostics, setBiometricDiagnostics] = useState<BiometricDiagnostics | null>(null);
  const [biometricMessage, setBiometricMessage] = useState('');
  const [biometricMessageType, setBiometricMessageType] = useState<'success' | 'error'>('success');
  const [activeTheme, setActiveTheme] = useState<'dark' | 'light'>(settings.theme === 'light' ? 'light' : 'dark');
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    const userId = auth.currentUser?.uid;
    setBiometricEnabled(Boolean(userId && isBiometricLockEnabled(userId)));
    setBiometricMessage('');
    setDiagnosticsLoading(true);

    void getBiometricDiagnostics()
      .then((result) => {
        if (active) setBiometricDiagnostics(result);
      })
      .catch((error: unknown) => {
        if (active) {
          setBiometricDiagnostics(null);
          setBiometricMessage(error instanceof Error ? error.message : 'Status biometrik perangkat belum dapat diperiksa.');
          setBiometricMessageType('error');
        }
      })
      .finally(() => {
        if (active) setDiagnosticsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    void refreshRespondentNotificationPermission().then((permission) => {
      if (active) setNotificationPermission(permission);
    }).catch(() => {
      if (active) setNotificationPermission('unsupported');
    });
    return () => { active = false; };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) setActiveTheme(settings.theme === 'light' ? 'light' : 'dark');
  }, [isOpen, settings.theme]);

  if (!isOpen) return null;

  const handleEnableBiometric = async () => {
    const user = auth.currentUser;
    if (!user) {
      setBiometricMessageType('error');
      setBiometricMessage('Sesi akun SIPANDU tidak ditemukan. Masuk kembali sebelum mengaktifkan biometrik.');
      return;
    }
    if (!biometricDiagnostics?.isAvailable) {
      setBiometricMessageType('error');
      setBiometricMessage(
        biometricDiagnostics?.reason ||
        'Biometrik belum terdeteksi. Daftarkan wajah atau sidik jari pada pengaturan keamanan perangkat terlebih dahulu.'
      );
      return;
    }

    setBiometricBusy(true);
    setBiometricMessage('');
    try {
      await enableBiometricLock({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
      });
      setBiometricEnabled(true);
      setBiometricMessageType('success');
      setBiometricMessage('Biometrik SIPANDU berhasil diaktifkan pada akun ini.');
    } catch (error) {
      setBiometricMessageType('error');
      setBiometricMessage(error instanceof Error ? error.message : 'Biometrik belum berhasil diaktifkan.');
    } finally {
      setBiometricBusy(false);
    }
  };

  const handleDisableBiometric = () => {
    disableBiometricLock();
    setBiometricEnabled(false);
    setBiometricMessageType('success');
    setBiometricMessage('Pengaman biometrik SIPANDU dinonaktifkan.');
  };

  const handleEnableNotifications = async () => {
    if (!auth.currentUser) { setNotificationMessage('Masuk kembali ke SIPANDU sebelum mengaktifkan notifikasi.'); return; }
    setNotificationBusy(true);
    setNotificationMessage('');
    try {
      const permission = await enableRespondentNotifications();
      setNotificationPermission(permission);
      setNotificationMessage(permission === 'granted'
        ? 'Izin notifikasi aktif. Pengingat lokal disinkronkan setelah data layanan dimuat.'
        : permission === 'denied'
          ? 'Izin notifikasi ditolak Android. Aktifkan izin SIPANDU melalui Pengaturan Aplikasi Android.'
          : 'Izin notifikasi belum tersedia pada perangkat ini.');
    } catch (error) {
      setNotificationMessage(error instanceof Error ? error.message : 'Izin notifikasi belum berhasil diaktifkan.');
    } finally { setNotificationBusy(false); }
  };

  const handleThemeChange = (theme: 'dark' | 'light') => {
    setActiveTheme(theme);
    onSave({ ...settings, theme });
  };

  const biometricAvailable = Boolean(biometricDiagnostics?.isAvailable);

  const standaloneNavigator = typeof navigator !== 'undefined'
    && (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const runtimeCapabilities = detectPwaRuntimeCapabilities({
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    serviceWorkerAvailable: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
    browserNotificationsAvailable: typeof window !== 'undefined' && 'Notification' in window,
    standaloneMode: standaloneNavigator
      || (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        && window.matchMedia('(display-mode: standalone)').matches),
  });

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/75 px-0 pt-6 backdrop-blur-sm sm:items-center sm:px-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="sipandu-settings-title"
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-emerald-400/20 bg-[#0d1b10] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-white shadow-2xl sm:rounded-3xl sm:p-6"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-emerald-300/25 bg-emerald-300/10 p-2.5 text-emerald-200">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">SIPANDU ODHIV</p>
              <h2 id="sipandu-settings-title" className="mt-1 text-lg font-extrabold">Pengaturan SIPANDU</h2>
              <p className="mt-1 text-xs leading-relaxed text-neutral-400">Atur pengaman biometrik dan mode layar aplikasi.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pengaturan"
            className="rounded-xl border border-white/10 p-2 text-neutral-300 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <section className="rounded-2xl border border-sky-300/20 bg-sky-950/20 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Fingerprint className="h-5 w-5 text-sky-200" />
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-sky-100">Biometrik</h3>
                <p className="mt-0.5 text-[11px] text-neutral-400">
                  Gunakan wajah atau sidik jari yang telah terdaftar pada perangkat.
                </p>
              </div>
              <span className={'ml-auto shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ' + (biometricEnabled ? 'bg-emerald-300/15 text-emerald-200' : 'bg-white/10 text-neutral-300')}>
                {biometricEnabled ? 'Aktif' : 'Belum aktif'}
              </span>
            </div>

            <p className="mb-3 text-[11px] leading-relaxed text-neutral-300">
              {diagnosticsLoading
                ? 'Memeriksa dukungan biometrik perangkat…'
                : biometricAvailable
                  ? 'Biometrik tersedia. Android akan menampilkan metode yang didukung perangkat; SIPANDU tidak menyimpan data wajah atau sidik jari.'
                  : biometricDiagnostics?.reason ||
                    'Biometrik tidak terdeteksi. Daftarkan wajah atau sidik jari pada pengaturan keamanan perangkat, lalu periksa kembali.'}
            </p>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => void handleEnableBiometric()}
                disabled={biometricBusy || diagnosticsLoading || !biometricAvailable || !auth.currentUser}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-300 px-3 py-3 text-sm font-bold text-sky-950 transition hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {biometricBusy
                  ? <RefreshCw className="h-4 w-4 animate-spin" />
                  : <Fingerprint className="h-4 w-4" />}
                {biometricBusy ? 'Memproses…' : biometricEnabled ? 'Daftar Ulang Biometrik' : 'Aktifkan Biometrik'}
              </button>
              {biometricEnabled && (
                <button
                  type="button"
                  onClick={handleDisableBiometric}
                  disabled={biometricBusy}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-300/30 bg-rose-950/25 px-3 py-3 text-sm font-bold text-rose-100 transition hover:bg-rose-950/50 disabled:opacity-50"
                >
                  Nonaktifkan Biometrik
                </button>
              )}
            </div>

            {biometricMessage && (
              <p
                role="status"
                className={'mt-3 flex items-start gap-2 rounded-xl border p-3 text-xs leading-relaxed ' + (biometricMessageType === 'success' ? 'border-emerald-300/20 bg-emerald-950/35 text-emerald-100' : 'border-rose-300/20 bg-rose-950/35 text-rose-100')}
              >
                {biometricMessageType === 'success'
                  ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                <span>{biometricMessage}</span>
              </p>
            )}
          </section>

          {Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android' && (
            <section className="rounded-2xl border border-amber-300/20 bg-amber-950/20 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Bell className="h-5 w-5 text-amber-200" />
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-amber-100">Pemberitahuan & Pengingat</h3>
                  <p className="mt-0.5 text-[11px] text-neutral-400">Izin Android untuk respons baru dan pengingat tindak lanjut lokal.</p>
                </div>
                <span className="ml-auto shrink-0 rounded-full bg-white/10 px-2 py-1 text-[10px] font-bold text-neutral-200">
                  {notificationPermission === 'granted' ? 'Izin aktif' : notificationPermission === 'denied' ? 'Ditolak' : 'Belum aktif'}
                </span>
              </div>
              <p className="mb-3 text-[11px] leading-relaxed text-neutral-300">
                Pengingat memakai tanggal tindak lanjut yang telah disimpan. Notifikasi layar kunci tidak memuat nama, NIK, alamat, status kesehatan, atau rincian layanan PPKS.
              </p>
              <button type="button" onClick={() => void handleEnableNotifications()} disabled={notificationBusy || !auth.currentUser} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-300 px-3 py-3 text-sm font-bold text-amber-950 disabled:cursor-not-allowed disabled:opacity-50">
                {notificationBusy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
                {notificationBusy ? 'Memeriksa izin…' : notificationPermission === 'granted' ? 'Periksa Izin Notifikasi' : 'Aktifkan Notifikasi Android'}
              </button>
              {notificationMessage && <p role="status" className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-relaxed text-neutral-200">{notificationMessage}</p>}
              <p className="mt-3 text-[10px] leading-relaxed text-neutral-500">Jadwal lokal disinkronkan saat SIPANDU terbuka dan data layanan berhasil dimuat. Ketepatan waktu mengikuti izin alarm dan kebijakan baterai Android.</p>
            </section>
          )}

          <section className="rounded-2xl border border-emerald-300/20 bg-emerald-950/20 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Sun className="h-5 w-5 text-emerald-200" />
              <div>
                <h3 className="text-sm font-bold text-emerald-100">Mode Layar</h3>
                <p className="mt-0.5 text-[11px] text-neutral-400">Pilih tema terang atau gelap untuk SIPANDU.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Mode Layar SIPANDU">
              <button
                type="button"
                aria-pressed={activeTheme === 'light'}
                onClick={() => handleThemeChange('light')}
                className={'inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-bold transition ' + (activeTheme === 'light' ? 'border-emerald-300 bg-emerald-300 text-emerald-950' : 'border-white/15 bg-black/20 text-neutral-200 hover:bg-white/10')}
              >
                <Sun className="h-4 w-4" /> Terang
              </button>
              <button
                type="button"
                aria-pressed={activeTheme === 'dark'}
                onClick={() => handleThemeChange('dark')}
                className={'inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-bold transition ' + (activeTheme === 'dark' ? 'border-sky-300 bg-sky-300 text-sky-950' : 'border-white/15 bg-black/20 text-neutral-200 hover:bg-white/10')}
              >
                <Moon className="h-4 w-4" /> Gelap
              </button>
            </div>
          </section>
          <section className="rounded-2xl border border-cyan-300/20 bg-cyan-950/20 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-cyan-200" />
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-cyan-100">Huawei & HarmonyOS</h3>
                <p className="mt-0.5 text-[11px] text-neutral-400">Panduan akses PWA dan pemeriksaan kemampuan browser perangkat.</p>
              </div>
              <span className="ml-auto shrink-0 rounded-full bg-cyan-300/10 px-2 py-1 text-[10px] font-bold text-cyan-100">
                {runtimeCapabilities.isHuaweiDevice ? 'Huawei terdeteksi' : 'Panduan lintas perangkat'}
              </span>
            </div>
            <p className="mb-3 text-[11px] leading-relaxed text-neutral-300">
              Perkiraan perangkat: <strong className="text-cyan-100">{runtimeCapabilities.platformLabel}</strong>.
              User-agent dapat disederhanakan browser; hasil ini bukan verifikasi model atau versi OS.
            </p>
            <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-black/20 p-2.5">
                <p className="text-[10px] text-neutral-400">Service Worker</p>
                <strong className="text-xs">{runtimeCapabilities.serviceWorkerAvailable ? 'API tersedia' : 'Tidak tersedia'}</strong>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-2.5">
                <p className="text-[10px] text-neutral-400">Notification API</p>
                <strong className="text-xs">{runtimeCapabilities.browserNotificationsAvailable ? 'API tersedia' : 'Tidak tersedia'}</strong>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-2.5">
                <p className="text-[10px] text-neutral-400">Mode tampilan</p>
                <strong className="text-xs">{runtimeCapabilities.standaloneMode ? 'Standalone' : 'Browser / pintasan'}</strong>
              </div>
            </div>
            <ol className="space-y-2 text-[11px] leading-relaxed text-neutral-300">
              <li><strong className="text-white">1.</strong> Buka <span className="font-semibold text-cyan-100">https://sipanduodhiv.my.id</span> melalui Huawei Browser.</li>
              <li><strong className="text-white">2.</strong> Pada HarmonyOS sebelum versi 5 atau EMUI, buka menu browser lalu pilih <strong className="text-white">Tambahkan ke → Desktop / Layar utama</strong> bila tersedia.</li>
              <li><strong className="text-white">3.</strong> Pada HarmonyOS 5 ke atas, buka menu browser lalu pilih <strong className="text-white">Tambahkan ke layar utama / Buat pintasan</strong> apabila tersedia. Nama menu dapat berbeda menurut versi dan wilayah.</li>
              <li><strong className="text-white">4.</strong> Buka ikon pintasan SIPANDU dan masuk dengan akun resmi.</li>
            </ol>
            <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-950/25 p-3 text-[10px] leading-relaxed text-amber-100">
              <strong>Batas kompatibilitas:</strong> HarmonyOS NEXT tidak boleh diasumsikan menjalankan APK Android secara native. Pintasan web mungkin membuka Huawei Browser dan belum tentu menjadi jendela PWA standalone. APK ini bukan paket HarmonyOS native / AppGallery. Notifikasi sistem bergantung pada dukungan browser dan izin OS; notifikasi dalam aplikasi menjadi jalur cadangan.
            </div>
          </section>

        </div>
      </section>
    </div>
  );
};
