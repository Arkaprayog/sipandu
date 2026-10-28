import React, { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { Fingerprint, ShieldCheck, RefreshCw } from 'lucide-react';
import { auth } from '../lib/firebase';
import { authenticateBiometricLock, isBiometricLockEnabled } from '../lib/biometricLock';

export const BiometricGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Start locked when the preference is enabled so authenticated content cannot flash
  // between the first render and Firebase's asynchronous auth-state callback.
  const [locked, setLocked] = useState(() => Capacitor.isNativePlatform() && isBiometricLockEnabled());
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const lastAuthenticatedUid = useRef<string | null>(null);
  const attemptInFlight = useRef(false);
  const wasBackgrounded = useRef(false);

  const authenticate = useCallback(async (uid: string) => {
    if (attemptInFlight.current) return;
    attemptInFlight.current = true;
    setLocked(true);
    setChecking(true);
    setError('');
    try {
      await authenticateBiometricLock();
      lastAuthenticatedUid.current = uid;
      setLocked(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Verifikasi biometrik gagal. Coba lagi.';
      const code = e && typeof e === 'object' && 'code' in e
        ? String((e as { code?: unknown }).code || '')
        : '';
      setError(code ? `${message} (kode diagnostik: ${code})` : message);
      setLocked(true);
    } finally {
      setChecking(false);
      attemptInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        lastAuthenticatedUid.current = null;
        setLocked(false);
        setError('');
        return;
      }
      if (!isBiometricLockEnabled()) {
        lastAuthenticatedUid.current = user.uid;
        setLocked(false);
        return;
      }
      if (lastAuthenticatedUid.current !== user.uid) void authenticate(user.uid);
    });

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (auth.currentUser && isBiometricLockEnabled()) {
          // Mask sensitive content before the OS app switcher/background snapshot.
          wasBackgrounded.current = true;
          setLocked(true);
          setError('');
        }
        return;
      }
      if (document.visibilityState === 'visible' && wasBackgrounded.current) {
        wasBackgrounded.current = false;
        const user = auth.currentUser;
        if (user && isBiometricLockEnabled()) {
          lastAuthenticatedUid.current = null;
          void authenticate(user.uid);
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [authenticate]);

  if (!Capacitor.isNativePlatform() || !locked) return <>{children}</>;

  return (
    <main className="fixed inset-0 z-[9999] grid min-h-screen place-items-center bg-[#07120b] px-6 py-10 text-white">
      <section className="w-full max-w-sm rounded-3xl border border-white/15 bg-white/[0.06] p-7 text-center shadow-2xl">
        <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl border border-emerald-300/30 bg-emerald-300/10">
          <Fingerprint className="h-9 w-9 text-emerald-200" />
        </div>
        <div className="mb-2 flex items-center justify-center gap-2 text-emerald-100">
          <ShieldCheck className="h-4 w-4" />
          <span className="text-xs font-bold uppercase tracking-[0.18em]">SIPANDU ODHIV Aman</span>
        </div>
        <h1 className="text-xl font-extrabold">Verifikasi biometrik</h1>
        <p className="mt-2 text-sm leading-relaxed text-white/70">Buka aplikasi menggunakan sidik jari, face unlock, atau PIN perangkat sebagai cadangan.</p>
        {error && <p role="alert" className="mt-4 rounded-xl border border-red-300/25 bg-red-500/10 p-3 text-xs text-red-100">{error}</p>}
        <button type="button" disabled={checking} onClick={() => auth.currentUser && void authenticate(auth.currentUser.uid)} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-300 px-4 py-3 font-bold text-emerald-950 disabled:opacity-60">
          {checking ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />}
          {checking ? 'Memverifikasi…' : 'Buka dengan biometrik'}
        </button>
      </section>
    </main>
  );
};
