import React, { useEffect, useState } from 'react';
import { KeyRound, LockKeyhole, RefreshCw, X, CheckCircle2, AlertCircle, Sun, Moon, ShieldCheck } from 'lucide-react';
import { isAppPinConfigured, setAppPin } from '../lib/biometricLock';
import { auth } from '../lib/firebase';
import { AppSettings } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (updated: AppSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, onSave }) => {
  const [pinConfigured, setPinConfigured] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinBusy, setPinBusy] = useState(false);
  const [pinMessage, setPinMessage] = useState('');
  const [pinMessageType, setPinMessageType] = useState<'success' | 'error'>('success');
  const [activeTheme, setActiveTheme] = useState<'dark' | 'light'>(settings.theme === 'light' ? 'light' : 'dark');

  useEffect(() => {
    if (!isOpen) return;
    setPinConfigured(isAppPinConfigured(auth.currentUser?.uid));
    setNewPin('');
    setConfirmPin('');
    setPinMessage('');
    setActiveTheme(settings.theme === 'light' ? 'light' : 'dark');
  }, [isOpen, settings.theme]);

  if (!isOpen) return null;

  const handleSavePin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pinBusy) return;
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setPinMessageType('error');
      setPinMessage('Sesi akun tidak ditemukan. Masuk kembali dengan akun SIPANDU.');
      return;
    }

    setPinBusy(true);
    setPinMessage('');
    try {
      await setAppPin(newPin, confirmPin, uid);
      setPinConfigured(true);
      setNewPin('');
      setConfirmPin('');
      setPinMessageType('success');
      setPinMessage('PIN Aplikasi SIPANDU berhasil disimpan.');
    } catch (error) {
      setPinMessageType('error');
      setPinMessage(error instanceof Error ? error.message : 'PIN belum berhasil disimpan.');
    } finally {
      setPinBusy(false);
    }
  };

  const handleThemeChange = (theme: 'dark' | 'light') => {
    setActiveTheme(theme);
    onSave({ ...settings, theme });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/75 px-0 pt-6 backdrop-blur-sm sm:items-center sm:px-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="sipandu-settings-title"
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-emerald-400/20 bg-[#0d1b10] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-white shadow-2xl sm:rounded-3xl sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-emerald-300/25 bg-emerald-300/10 p-2.5 text-emerald-200"><ShieldCheck className="h-6 w-6" /></div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">SIPANDU ODHIV</p>
              <h2 id="sipandu-settings-title" className="mt-1 text-lg font-extrabold">Pengaturan SIPANDU</h2>
              <p className="mt-1 text-xs leading-relaxed text-neutral-400">Atur PIN keamanan dan tampilan aplikasi.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup pengaturan" className="rounded-xl border border-white/10 p-2 text-neutral-300 transition hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-4">
          <section className="rounded-2xl border border-sky-300/20 bg-sky-950/20 p-4">
            <div className="mb-3 flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-sky-200" />
              <div>
                <h3 className="text-sm font-bold text-sky-100">PIN Aplikasi SIPANDU · 4 digit</h3>
                <p className="mt-0.5 text-[11px] text-neutral-400">{pinConfigured ? 'PIN sudah terdaftar. Masukkan PIN baru untuk menggantinya.' : 'Buat PIN 4 digit untuk keamanan lokal aplikasi.'}</p>
              </div>
              {pinConfigured && <CheckCircle2 className="ml-auto h-5 w-5 shrink-0 text-emerald-300" />}
            </div>
            <form onSubmit={handleSavePin} className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-[11px] font-semibold text-sky-100">
                  {pinConfigured ? 'PIN baru' : 'Buat PIN'}
                  <input type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{4}" maxLength={4} minLength={4}
                    value={newPin} onChange={(event) => setNewPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="4 digit" aria-label="PIN baru empat digit" required
                    className="mt-1.5 w-full rounded-xl border border-sky-300/20 bg-black/35 px-3 py-3 text-center text-xl tracking-[0.35em] text-white outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-300/20" />
                </label>
                <label className="block text-[11px] font-semibold text-sky-100">
                  Konfirmasi PIN
                  <input type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{4}" maxLength={4} minLength={4}
                    value={confirmPin} onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="Ulangi PIN" aria-label="Konfirmasi PIN empat digit" required
                    className="mt-1.5 w-full rounded-xl border border-sky-300/20 bg-black/35 px-3 py-3 text-center text-xl tracking-[0.35em] text-white outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-300/20" />
                </label>
              </div>
              <button type="submit" disabled={pinBusy || newPin.length !== 4 || confirmPin.length !== 4}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-300 px-4 py-3 text-sm font-bold text-sky-950 transition hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-50">
                {pinBusy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
                {pinBusy ? 'Menyimpan PIN…' : pinConfigured ? 'Simpan PIN baru' : 'Simpan PIN'}
              </button>
            </form>
            {pinMessage && <p role="status" className={'mt-3 flex items-start gap-2 rounded-xl border p-3 text-xs leading-relaxed ' + (pinMessageType === 'success' ? 'border-emerald-300/20 bg-emerald-950/35 text-emerald-100' : 'border-rose-300/20 bg-rose-950/35 text-rose-100')}>
              {pinMessageType === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}<span>{pinMessage}</span>
            </p>}
          </section>

          <section className="rounded-2xl border border-emerald-300/20 bg-emerald-950/20 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Sun className="h-5 w-5 text-emerald-200" />
              <div><h3 className="text-sm font-bold text-emerald-100">Mode Tampilan</h3><p className="mt-0.5 text-[11px] text-neutral-400">Pilih tema terang atau gelap untuk SIPANDU.</p></div>
            </div>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Mode tampilan SIPANDU">
              <button type="button" aria-pressed={activeTheme === 'light'} onClick={() => handleThemeChange('light')}
                className={'inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-bold transition ' + (activeTheme === 'light' ? 'border-emerald-300 bg-emerald-300 text-emerald-950' : 'border-white/15 bg-black/20 text-neutral-200 hover:bg-white/10')}>
                <Sun className="h-4 w-4" /> Terang
              </button>
              <button type="button" aria-pressed={activeTheme === 'dark'} onClick={() => handleThemeChange('dark')}
                className={'inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-bold transition ' + (activeTheme === 'dark' ? 'border-sky-300 bg-sky-300 text-sky-950' : 'border-white/15 bg-black/20 text-neutral-200 hover:bg-white/10')}>
                <Moon className="h-4 w-4" /> Gelap
              </button>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
};
