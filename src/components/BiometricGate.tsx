import React, { useCallback, useEffect, useRef, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { isBiometricLockEnabled } from '../lib/biometricLock';
import { LoginPage } from './LoginPage';

/**
 * The Firebase session remains active across page reloads. A reload/visibility
 * transition must not be treated as an app-lock event. Native backgrounding
 * outside an intentional Google OAuth hand-off and the explicit SIPANDU lock
 * action still require quick unlock.
 */
export const BiometricGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locked, setLocked] = useState(false);
  const nativeGoogleAuthInProgress = useRef(false);
  const backgroundedDuringGoogleAuth = useRef(false);

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
    const lockCurrentUser = () => {
      const user = auth.currentUser;
      if (user && isBiometricLockEnabled(user.uid)) setLocked(true);
    };
    const handleGoogleAuthStart = () => {
      nativeGoogleAuthInProgress.current = true;
    };
    const handleGoogleAuthEnd = () => {
      nativeGoogleAuthInProgress.current = false;
      if (!backgroundedDuringGoogleAuth.current) return;
      backgroundedDuringGoogleAuth.current = false;

      // Do not lock while returning from Google's account/consent Activity.
      // If the user actually left SIPANDU in the background, lock it as soon
      // as the native OAuth hand-off ends.
      void CapacitorApp.getState().then((state) => {
        if (mounted && !state.isActive) lockCurrentUser();
      }).catch((error) => {
        console.warn('SIPANDU could not inspect app state after Google Sign-In:', error);
        if (mounted) lockCurrentUser();
      });
    };

    window.addEventListener('sipandu:native-google-auth-start', handleGoogleAuthStart);
    window.addEventListener('sipandu:native-google-auth-end', handleGoogleAuthEnd);

    void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) return;
      if (nativeGoogleAuthInProgress.current) {
        backgroundedDuringGoogleAuth.current = true;
        return;
      }
      lockCurrentUser();
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
      window.removeEventListener('sipandu:native-google-auth-start', handleGoogleAuthStart);
      window.removeEventListener('sipandu:native-google-auth-end', handleGoogleAuthEnd);
      if (listener) void listener.remove();
    };
  }, []);

  if (!locked) return <>{children}</>;
  return <LoginPage onLogin={unlock} />;
};
