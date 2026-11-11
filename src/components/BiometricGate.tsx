import React, { useCallback, useEffect, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { isBiometricLockEnabled } from '../lib/biometricLock';
import { LoginPage } from './LoginPage';

/**
 * The Firebase session remains active across page reloads. A reload/visibility
 * transition must not be treated as an app-lock event. Native backgrounding
 * and the explicit SIPANDU lock action still require quick unlock.
 */
export const BiometricGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locked, setLocked] = useState(false);

  const unlock = useCallback(() => {
    setLocked(false);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      // A restored user is not a new login attempt and must not be locked here.
      if (!user) setLocked(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const lockApp = () => {
      const user = auth.currentUser;
      if (user && isBiometricLockEnabled(user.uid)) setLocked(true);
    };
    window.addEventListener('sipandu:lock-app', lockApp);
    return () => window.removeEventListener('sipandu:lock-app', lockApp);
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let mounted = true;
    let listener: { remove: () => Promise<void> } | undefined;

    void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) return;
      const user = auth.currentUser;
      if (user && isBiometricLockEnabled(user.uid)) setLocked(true);
    }).then((handle) => {
      if (!mounted) {
        void handle.remove();
        return;
      }
      listener = handle;
    }).catch((error) => {
      console.warn('SIPANDU could not register native app-background lock:', error);
    });

    return () => {
      mounted = false;
      if (listener) void listener.remove();
    };
  }, []);

  if (!locked) return <>{children}</>;
  return <LoginPage onLogin={unlock} />;
};
