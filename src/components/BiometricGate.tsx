import React, { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { Fingerprint, ShieldCheck, RefreshCw, KeyRound, LockKeyhole, ScanFace } from 'lucide-react';
import { auth, googleLogout } from '../lib/firebase';
import {
  authenticateBiometricLock,
  isAppPinConfigured,
  isBiometricLockEnabled,
  isQuickUnlockEnabled,
  resetQuickUnlockSettings,
  verifyAppPin,
} from '../lib/biometricLock';

export const BiometricGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Do not flash the dashboard between Firebase's session restore and the local unlock gate.
  const [locked, setLocked] = useState(() => isQuickUnlockEnabled());
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [userId, setUserId] = useState('');
  const [hasPin, setHasPin] = useState(false);
  const [hasBiometric, setHasBiometric] = useState(false);
  const [pin, setPin] = useState('');
  const [showPinFallback, setShowPinFallback] = useState(false);

  const unlock = useCallback(() => {
    setLocked(false);
    setError('');
    setPin('');
  }, []);

  const authenticate = useCallback(async () => {
    if (!userId || checking) return;
    if (!hasBiometric || !isBiometricLockEnabled(userId)) {
      setError('Biometrik belum diaktifkan untuk akun ini. Gunakan PIN SIPANDU atau aktifkan biometrik pada Pengaturan.');
      return;
    }
    setChecking(true);
    setError('');
    try {
      await authenticateBiometricLock(userId);
      unlock();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Verifikasi biometrik gagal. Silakan coba lagi.';
      setError(message + (hasPin ? ' Gunakan PIN SIPANDU sebagai cadangan atau coba biometrik lagi.' : ' Coba lagi atau masuk dengan email dan kata sandi jika sesi akun telah berakhir.'));
      setShowPinFallback(hasPin);
    } finally {
      setChecking(false);
    }
  }, [checking, hasBiometric, hasPin, unlock, userId]);

  const authenticatePin = useCallback(async () => {
    if (!userId || checking) return;
    setChecking(true);
    setError('');
    try {
      const result = await verifyAppPin(pin, userId);
      if (result.ok) {
        unlock();
      } else {
        setError(result.message || 'PIN belum dapat diverifikasi.');
        if (result.retryAfterMs) setPin('');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PIN belum dapat diverifikasi.');
    } finally {
      setChecking(false);
    }
  }, [checking, pin, unlock, userId]);

  const recoverWithPassword = useCallback(async () => {
    if (checking) return;
    const confirmed = window.confirm(
      'Pemulihan ini akan menghapus PIN dan pendaftaran biometrik lokal pada perangkat ini. Data SIPANDU tidak dihapus. Anda perlu masuk dengan email/kata sandi dan mendaftarkan metode buka cepat kembali. Lanjutkan?'
    );
    if (!confirmed) return;
    setChecking(true);
    setError('');
    try {
      // Clear only the local quick-unlock layer to prevent a forgotten PIN or old
      // biometric preference from locking the user out after password reauthentication.
      resetQuickUnlockSettings();
      await signOut(auth);
      await googleLogout();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Tidak dapat membuka alur pemulihan akun. Coba muat ulang aplikasi.');
    } finally {
      setChecking(false);
    }
  }, [checking]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setError('');
      setPin('');
      if (!user) {
        setUserId('');
        setHasPin(false);
        setHasBiometric(false);
        setLocked(false);
        return;
      }

      setUserId(user.uid);
      const configured = isQuickUnlockEnabled(user.uid);
      const pinAvailable = isAppPinConfigured(user.uid);
      const biometricAvailable = isBiometricLockEnabled(user.uid);
      setHasPin(pinAvailable);
      setHasBiometric(biometricAvailable);
      setShowPinFallback(!biometricAvailable);
      // A live Firebase session is preserved; quick unlock is a local privacy gate
      // in front of it. A PIN/passkey never creates or replaces a Firebase session.
      setLocked(configured);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (auth.currentUser && isQuickUnlockEnabled(auth.currentUser.uid)) {
          setLocked(true);
          setError('');
          setPin('');
          setShowPinFallback(!isBiometricLockEnabled(auth.currentUser.uid));
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  if (!locked) return <>{children}</>;

  const isWebPwa = !Capacitor.isNativePlatform();
  const biometricLabel = isWebPwa ? 'Masuk dengan biometrik perangkat' : 'Masuk dengan Face Unlock / Fingerprint';

  return (
    <main className="fixed inset-0 z-[9999] grid min-h-screen place-items-center overflow-y-auto bg-[#07120b] px-5 py-8 text-white">
      <section className="w-full max-w-sm rounded-3xl border border-emerald-300/20 bg-[#0e1d11] p-6 text-center shadow-2xl">
        <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl border border-emerald-300/30 bg-emerald-300/10">
          <ShieldCheck className="h-9 w-9 text-emerald-200" />
        </div>
        <div className="mb-2 flex items-center justify-center gap-2 text-emerald-100">
          <LockKeyhole className="h-4 w-4" />
          <span className="text-xs font-bold uppercase tracking-[0.16em]">SIPANDU ODHIV Aman</span>
        </div>
        <h1 className="text-xl font-extrabold">Masuk SIPANDU</h1>
        <p className="mt-2 text-sm leading-relaxed text-white/70">
          Sesi akun Anda masih tersimpan. Verifikasi perangkat untuk membuka dashboard tanpa mengetik email dan kata sandi lagi.
        </p>

        {hasBiometric && (
          <button
            type="button"
            disabled={checking}
            onClick={() => void authenticate()}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-300 px-4 py-3 text-sm font-bold text-emerald-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {checking ? <RefreshCw className="h-4 w-4 animate-spin" /> : isWebPwa ? <ScanFace className="h-4 w-4" /> : <Fingerprint className="h-4 w-4" />}
            {checking ? 'Memverifikasi…' : biometricLabel}
          </button>
        )}

        {hasPin && showPinFallback && (
          <form
            className="mt-5 border-t border-white/10 pt-5 text-left"
            onSubmit={(event) => {
              event.preventDefault();
              void authenticatePin();
            }}
          >
            <label htmlFor="sipandu-quick-pin" className="mb-2 block text-xs font-semibold text-emerald-100">
              PIN SIPANDU (4 angka)
            </label>
            <input
              id="sipandu-quick-pin"
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{4}"
              maxLength={4}
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="••••"
              aria-label="PIN SIPANDU empat angka"
              className="w-full rounded-xl border border-white/15 bg-black/35 px-4 py-3 text-center text-2xl tracking-[0.55em] text-white outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/20"
              required
            />
            <button
              type="submit"
              disabled={checking || pin.length !== 4}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-sky-300/30 bg-sky-300/10 px-4 py-3 text-sm font-bold text-sky-100 transition hover:bg-sky-300/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {checking ? <RefreshCw className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              {checking ? 'Memeriksa PIN…' : 'Masuk dengan PIN'}
            </button>
          </form>
        )}

        {error && <p role="alert" className="mt-4 rounded-xl border border-red-300/25 bg-red-500/10 p-3 text-left text-xs leading-relaxed text-red-100">{error}</p>}

        {!hasBiometric && !hasPin && (
          <p className="mt-4 rounded-xl border border-amber-300/25 bg-amber-500/10 p-3 text-left text-xs text-amber-100">
            Metode buka cepat belum tersedia untuk akun ini. Masuk dengan akun SIPANDU dan daftarkan PIN atau biometrik pada Pengaturan.
          </p>
        )}

        <p className="mt-5 text-[10px] leading-relaxed text-white/45">
          Jika sesi Firebase telah berakhir, Anda tetap perlu masuk kembali dengan akun resmi. PIN dan biometrik hanya membuka kunci lokal, bukan menggantikan izin akun SIPANDU.
        </p>
        <button
          type="button"
          disabled={checking}
          onClick={() => void recoverWithPassword()}
          className="mt-4 w-full rounded-lg border border-white/10 px-3 py-2 text-[10px] text-white/60 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
        >
          Reset metode buka cepat dan masuk dengan email/kata sandi
        </button>
      </section>
    </main>
  );
};
