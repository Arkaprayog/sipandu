import React, { useEffect, useState } from 'react';
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
              <h2 id="sipandu-biometric-settings-title" className="mt-1 text-lg font-extrabold">Keamanan &amp; Biometrik</h2>
              <p className="mt-1 text-xs leading-relaxed text-neutral-400">
                Pengaturan ini hanya untuk PIN, Fingerprint, dan Face Unlock.
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
