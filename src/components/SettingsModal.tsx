import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Fingerprint,
  Moon,
  RefreshCw,
  ShieldCheck,
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
import { auth } from '../lib/firebase';
import { AppSettings } from '../types';

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

  const handleThemeChange = (theme: 'dark' | 'light') => {
    setActiveTheme(theme);
    onSave({ ...settings, theme });
  };

  const biometricAvailable = Boolean(biometricDiagnostics?.isAvailable);

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
        </div>
      </section>
    </div>
  );
};
