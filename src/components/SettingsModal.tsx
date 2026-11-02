import React, { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  Fingerprint,
  ScanFace,
  ShieldCheck,
  KeyRound,
  LockKeyhole,
  RefreshCw,
  X,
  CheckCircle2,
  AlertCircle,
  Bell,
  Image as ImageIcon,
  FolderOpen,
} from 'lucide-react';
import {
  enableBiometricLock,
  disableBiometricLock,
  isBiometricLockEnabled,
  getBiometricDiagnostics,
  isAppPinConfigured,
  setAppPin,
} from '../lib/biometricLock';
import { auth } from '../lib/firebase';
import {
  enableRespondentNotifications,
  getRespondentNotificationPermission,
  refreshRespondentNotificationPermission,
} from '../lib/respondentNotifications';
import { AppSettings } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Kept for the existing App integration; other application settings are no longer edited here. */
  settings: AppSettings;
  onSave: (updated: AppSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [biometricDiagnostics, setBiometricDiagnostics] = useState('Memeriksa dukungan perangkat…');
  const [pinConfigured, setPinConfigured] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinBusy, setPinBusy] = useState(false);
  const [pinMessage, setPinMessage] = useState('');
  const [pinMessageType, setPinMessageType] = useState<'success' | 'error'>('success');
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(getRespondentNotificationPermission());
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [photoPickerMessage, setPhotoPickerMessage] = useState('Akses foto memakai pemilih Android dan hanya berlaku untuk foto yang dipilih.');
  const [filePickerMessage, setFilePickerMessage] = useState('Akses dokumen memakai pemilih Android dan hanya berlaku untuk berkas yang dipilih.');
  const photoPickerRef = useRef<HTMLInputElement | null>(null);
  const filePickerRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    const user = auth.currentUser;

    setBiometricEnabled(isBiometricLockEnabled(user?.uid));
    setPinConfigured(isAppPinConfigured(user?.uid));
    setNewPin('');
    setConfirmPin('');
    setPinMessage('');
    setBiometricDiagnostics('Memeriksa dukungan biometrik perangkat…');
    setNotificationPermission(getRespondentNotificationPermission());
    setNotificationMessage('');

    void refreshRespondentNotificationPermission().then((permission) => {
      if (active) setNotificationPermission(permission);
    });
    void getBiometricDiagnostics()
      .then((result) => {
        if (!active) return;
        const isNative = Capacitor.isNativePlatform();
        const detail = result.isAvailable
          ? isNative
            ? 'Autentikasi biometrik Android tersedia. Sistem perangkat memilih metode yang didukung.'
            : 'WebAuthn tersedia pada browser ini. Gunakan autentikator perangkat melalui HTTPS.'
          : 'Belum tersedia. ' + (result.reason || 'Periksa kunci layar dan dukungan perangkat.');
        const types = result.biometryTypes.length ? result.biometryTypes.join(', ') : result.biometryType;
        const hardware = types && types !== 'none' ? ' Jenis terdeteksi: ' + types + '.' : '';
        const security = result.deviceIsSecure ? ' Keamanan perangkat aktif.' : '';
        const code = result.code ? ' Kode: ' + result.code + '.' : '';
        setBiometricDiagnostics(detail + hardware + security + code);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setBiometricDiagnostics(
          'Pemeriksaan gagal: ' + (error instanceof Error ? error.message : String(error))
        );
      });

    return () => { active = false; };
  }, [isOpen]);

  if (!isOpen) return null;

  const user = auth.currentUser;
  const biometricIsAvailable = biometricDiagnostics.startsWith('Autentikasi biometrik Android tersedia') ||
    biometricDiagnostics.startsWith('WebAuthn tersedia');

  const handleEnableNotifications = async () => {
    if (notificationBusy) return;
    setNotificationBusy(true);
    setNotificationMessage('');
    try {
      const result = await enableRespondentNotifications();
      setNotificationPermission(result);
      setNotificationMessage(
        result === 'granted'
          ? 'Izin notifikasi aktif. Bunyi, getar, banner, dan tampilan lock screen tetap mengikuti pengaturan aplikasi SIPANDU dan kontrol Android/Chrome.'
          : result === 'denied'
            ? 'Izin notifikasi ditolak atau diblokir. Aktifkan kembali melalui Pengaturan Android → Aplikasi → SIPANDU/Chrome → Notifikasi.'
            : 'Notifikasi sistem tidak tersedia pada browser/perangkat ini.'
      );
    } catch (error) {
      setNotificationMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setNotificationBusy(false);
    }
  };

  const refreshNotificationPermission = async () => {
    const result = await refreshRespondentNotificationPermission();
    setNotificationPermission(result);
    setNotificationMessage(
      result === 'granted'
        ? 'Status izin telah diperbarui dari sistem perangkat.'
        : result === 'denied'
          ? 'Sistem perangkat saat ini memblokir notifikasi SIPANDU.'
          : result === 'unsupported'
            ? 'API notifikasi tidak tersedia pada browser ini.'
            : 'Izin notifikasi belum diberikan.'
    );
  };

  const handleBiometricToggle = async () => {
    if (biometricBusy) return;
    if (!user?.uid) {
      setBiometricDiagnostics('Sesi akun SIPANDU tidak ditemukan. Masuk dengan akun resmi terlebih dahulu.');
      return;
    }
    if (biometricEnabled) {
      disableBiometricLock();
      setBiometricEnabled(false);
      setBiometricDiagnostics('Pengaman biometrik dinonaktifkan. PIN yang telah didaftarkan tetap tersedia.');
      return;
    }
    if (!pinConfigured) {
      setBiometricDiagnostics('Daftarkan PIN SIPANDU 4 angka terlebih dahulu. PIN wajib menjadi metode cadangan.');
      return;
    }

    setBiometricBusy(true);
    setBiometricDiagnostics('Menunggu verifikasi perangkat…');
    try {
      await enableBiometricLock({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
      });
      setBiometricEnabled(true);
      setBiometricDiagnostics('Biometrik berhasil didaftarkan. Metode perangkat tersedia saat membuka SIPANDU.');
    } catch (error) {
      setBiometricDiagnostics(
        'Pendaftaran belum berhasil: ' + (error instanceof Error ? error.message : 'Periksa pengaturan perangkat.')
      );
    } finally {
      setBiometricBusy(false);
    }
  };

  const handleSavePin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pinBusy) return;
    if (!user?.uid) {
      setPinMessageType('error');
      setPinMessage('Sesi akun tidak ditemukan. Masuk kembali dengan akun SIPANDU.');
      return;
    }

    setPinBusy(true);
    setPinMessage('');
    try {
      await setAppPin(newPin, confirmPin, user.uid);
      setPinConfigured(true);
      setNewPin('');
      setConfirmPin('');
      setPinMessageType('success');
      setPinMessage('PIN berhasil disimpan. PIN tersedia sebagai cadangan biometrik.');
      setBiometricDiagnostics((current) =>
        current.startsWith('Daftarkan PIN')
          ? 'PIN sudah terdaftar. Anda dapat mengaktifkan biometrik perangkat sekarang.'
          : current
      );
    } catch (error) {
      setPinMessageType('error');
      setPinMessage(error instanceof Error ? error.message : 'PIN belum berhasil disimpan.');
    } finally {
      setPinBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/75 px-0 pt-6 backdrop-blur-sm sm:items-center sm:px-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="sipandu-biometric-settings-title"
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-emerald-400/20 bg-[#0d1b10] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-white shadow-2xl sm:rounded-3xl sm:p-6"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-emerald-300/25 bg-emerald-300/10 p-2.5 text-emerald-200">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">SIPANDU ODHIV</p>
              <h2 id="sipandu-biometric-settings-title" className="mt-1 text-lg font-extrabold">Perizinan, Keamanan &amp; Biometrik</h2>
              <p className="mt-1 text-xs leading-relaxed text-neutral-400">
                Kelola izin notifikasi dan akses file, serta keamanan lokal perangkat.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pengaturan biometrik"
            className="rounded-xl border border-white/10 p-2 text-neutral-300 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <section className="rounded-2xl border border-sky-300/20 bg-sky-950/20 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Bell className="h-5 w-5 text-sky-200" />
              <div>
                <h3 className="text-sm font-bold text-sky-100">Izin Notifikasi</h3>
                <p className="text-[10px] text-neutral-400">Status langsung dari Android atau browser</p>
              </div>
              <span className={'ml-auto rounded-full px-2 py-1 text-[9px] font-bold ' + (notificationPermission === 'granted' ? 'bg-emerald-900/70 text-emerald-200' : notificationPermission === 'denied' ? 'bg-rose-900/70 text-rose-200' : 'bg-amber-900/70 text-amber-100')}>
                {notificationPermission === 'granted' ? 'AKTIF' : notificationPermission === 'denied' ? 'DIBLOKIR' : notificationPermission === 'unsupported' ? 'TIDAK DIDUKUNG' : 'BELUM AKTIF'}
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-neutral-300">
              SIPANDU memakai notifikasi sistem untuk respons Google Form, asesmen tahap awal, dan peringatan Google Workspace. Android mengatur suara, getar, banner, lock screen, serta badge melalui izin dan kanal notifikasi.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => void handleEnableNotifications()} disabled={notificationBusy || notificationPermission === 'unsupported'} className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-300 px-3 py-2.5 text-xs font-bold text-sky-950 disabled:opacity-50">
                {notificationBusy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
                {notificationBusy ? 'Memeriksa…' : 'Aktifkan / Pulihkan'}
              </button>
              <button type="button" onClick={() => void refreshNotificationPermission()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-300/25 px-3 py-2.5 text-xs font-semibold text-sky-100">
                <RefreshCw className="h-3.5 w-3.5" /> Periksa Status
              </button>
            </div>
            {notificationMessage && <p role="status" className="mt-2 text-[10px] leading-relaxed text-sky-100">{notificationMessage}</p>}
          </section>

          <section className="rounded-2xl border border-emerald-300/20 bg-emerald-950/15 p-4">
            <div className="mb-3 flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-emerald-200" />
              <h3 className="text-sm font-bold text-emerald-100">Izin Foto / Galeri</h3>
            </div>
            <p className="text-[11px] leading-relaxed text-neutral-300">
              SIPANDU tidak meminta izin membaca seluruh galeri. Android membuka pemilih foto dan memberi akses hanya pada foto yang Anda pilih. Ini lebih terbatas dan aman daripada izin penyimpanan penuh.
            </p>
            <input ref={photoPickerRef} type="file" accept="image/*" className="hidden" onChange={(event) => {
              const selected = event.currentTarget.files?.[0];
              if (selected) setPhotoPickerMessage('Pemilih foto berhasil mengembalikan berkas: ' + selected.name + '. Berkas hanya diuji; tidak diunggah atau disimpan.');
              event.currentTarget.value = '';
            }} />
            <button type="button" onClick={() => photoPickerRef.current?.click()} className="mt-3 w-full rounded-xl border border-emerald-300/25 bg-black/20 px-3 py-2.5 text-xs font-bold text-emerald-100">
              <ImageIcon className="mr-2 inline h-3.5 w-3.5" /> Uji akses foto / galeri
            </button>
            <p role="status" className="mt-2 text-[10px] leading-relaxed text-neutral-400">{photoPickerMessage}</p>
          </section>

          <section className="rounded-2xl border border-violet-300/20 bg-violet-950/15 p-4">
            <div className="mb-3 flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-violet-200" />
              <h3 className="text-sm font-bold text-violet-100">Izin File / Dokumen</h3>
            </div>
            <p className="text-[11px] leading-relaxed text-neutral-300">
              Untuk PDF, DOC/DOCX, dan dokumen lain, SIPANDU menggunakan pemilih berkas Android. Aplikasi hanya menerima berkas yang Anda pilih dan tidak memindai seluruh penyimpanan.
            </p>
            <input ref={filePickerRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.jpg,.jpeg,.png,.webp" className="hidden" onChange={(event) => {
              const selected = event.currentTarget.files?.[0];
              if (selected) setFilePickerMessage('Pemilih dokumen berhasil mengembalikan berkas: ' + selected.name + '. Berkas hanya diuji; tidak diunggah atau disimpan.');
              event.currentTarget.value = '';
            }} />
            <button type="button" onClick={() => filePickerRef.current?.click()} className="mt-3 w-full rounded-xl border border-violet-300/25 bg-black/20 px-3 py-2.5 text-xs font-bold text-violet-100">
              <FolderOpen className="mr-2 inline h-3.5 w-3.5" /> Uji akses file / dokumen
            </button>
            <p role="status" className="mt-2 text-[10px] leading-relaxed text-neutral-400">{filePickerMessage}</p>
          </section>

          <section className="rounded-2xl border border-sky-300/20 bg-sky-950/20 p-4">
            <div className="mb-3 flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-sky-200" />
              <div>
                <h3 className="text-sm font-bold text-sky-100">PIN SIPANDU · 4 angka</h3>
                <p className="mt-0.5 text-[11px] text-neutral-400">
                  {pinConfigured
                    ? 'PIN sudah terdaftar. Masukkan PIN baru untuk menggantinya.'
                    : 'Daftarkan PIN terlebih dahulu sebagai cadangan biometrik.'}
                </p>
              </div>
              {pinConfigured && <CheckCircle2 className="ml-auto h-5 w-5 shrink-0 text-emerald-300" />}
            </div>

            <form onSubmit={handleSavePin} className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-[11px] font-semibold text-sky-100">
                  {pinConfigured ? 'PIN baru' : 'Buat PIN'}
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    pattern="[0-9]{4}"
                    maxLength={4}
                    minLength={4}
                    value={newPin}
                    onChange={(event) => setNewPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="4 angka"
                    aria-label="PIN baru empat angka"
                    className="mt-1.5 w-full rounded-xl border border-sky-300/20 bg-black/35 px-3 py-3 text-center text-xl tracking-[0.35em] text-white outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-300/20"
                    required
                  />
                </label>
                <label className="block text-[11px] font-semibold text-sky-100">
                  Konfirmasi PIN
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    pattern="[0-9]{4}"
                    maxLength={4}
                    minLength={4}
                    value={confirmPin}
                    onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="Ulangi PIN"
                    aria-label="Konfirmasi PIN empat angka"
                    className="mt-1.5 w-full rounded-xl border border-sky-300/20 bg-black/35 px-3 py-3 text-center text-xl tracking-[0.35em] text-white outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-300/20"
                    required
                  />
                </label>
              </div>

              <button
                type="submit"
                disabled={pinBusy || newPin.length !== 4 || confirmPin.length !== 4}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-300 px-4 py-3 text-sm font-bold text-sky-950 transition hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pinBusy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
                {pinBusy ? 'Menyimpan PIN…' : pinConfigured ? 'Simpan PIN baru' : 'Daftarkan PIN'}
              </button>
            </form>

            {pinMessage && (
              <p
                role="status"
                className={'mt-3 flex items-start gap-2 rounded-xl border p-3 text-xs leading-relaxed ' + (
                  pinMessageType === 'success'
                    ? 'border-emerald-300/20 bg-emerald-950/35 text-emerald-100'
                    : 'border-rose-300/20 bg-rose-950/35 text-rose-100'
                )}
              >
                {pinMessageType === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                <span>{pinMessage}</span>
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-emerald-300/20 bg-emerald-950/20 p-4">
            <div className="mb-3 flex items-start gap-3">
              <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-2.5 text-emerald-100">
                <Fingerprint className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-emerald-100">Fingerprint</h3>
                  <span className="text-neutral-500">/</span>
                  <ScanFace className="h-4 w-4 text-sky-200" />
                  <h3 className="text-sm font-bold text-sky-100">Face Unlock</h3>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-neutral-300">
                  Perangkat atau browser memilih metode yang didukung. SIPANDU tidak membaca atau menyimpan citra wajah maupun sidik jari.
                </p>
              </div>
              {biometricEnabled && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-300" />}
            </div>

            <div role="status" className="mb-3 rounded-xl border border-white/10 bg-black/25 p-3 text-[11px] leading-relaxed text-neutral-300">
              {biometricDiagnostics}
            </div>

            {!pinConfigured && !biometricEnabled && (
              <p className="mb-3 flex items-start gap-2 rounded-xl border border-amber-300/20 bg-amber-950/25 p-3 text-[11px] leading-relaxed text-amber-100">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                Daftarkan PIN 4 angka di atas sebelum mengaktifkan biometrik. PIN menjadi cadangan bila verifikasi biometrik gagal.
              </p>
            )}

            <button
              type="button"
              disabled={biometricBusy || (!biometricEnabled && (!pinConfigured || !biometricIsAvailable))}
              onClick={() => void handleBiometricToggle()}
              className={'inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ' + (
                biometricEnabled
                  ? 'border border-rose-300/25 bg-rose-950/35 text-rose-100 hover:bg-rose-900/40'
                  : 'bg-emerald-300 text-emerald-950 hover:bg-emerald-200'
              )}
            >
              {biometricBusy
                ? <RefreshCw className="h-4 w-4 animate-spin" />
                : biometricEnabled
                  ? <ShieldCheck className="h-4 w-4" />
                  : <Fingerprint className="h-4 w-4" />}
              {biometricBusy
                ? 'Memproses…'
                : biometricEnabled
                  ? 'Nonaktifkan biometrik'
                  : 'Daftarkan biometrik perangkat'}
            </button>
          </section>

          <p className="px-1 text-[10px] leading-relaxed text-neutral-500">
            PIN dan biometrik hanya membuka kunci lokal. Sesi akun resmi SIPANDU dan izin Firebase tetap berlaku. Jika sesi akun berakhir, Anda perlu masuk kembali dengan akun resmi.
          </p>
        </div>
      </section>
    </div>
  );
};
