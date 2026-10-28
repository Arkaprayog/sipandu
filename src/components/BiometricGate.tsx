import React, { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { isQuickUnlockEnabled } from '../lib/biometricLock';
import { LoginPage } from './LoginPage';

/**
 * When a Firebase session is still active and local quick-unlock is configured,
 * reuse the existing login page instead of creating a separate biometric screen.
 * The login page offers fingerprint/face unlock and PIN fallback within its card.
 */
export const BiometricGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locked, setLocked] = useState(() => isQuickUnlockEnabled());

  const unlock = useCallback(() => {
    setLocked(false);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setLocked(Boolean(user && isQuickUnlockEnabled(user.uid)));
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        const user = auth.currentUser;
        if (user && isQuickUnlockEnabled(user.uid)) setLocked(true);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  if (!locked) return <>{children}</>;
  return <LoginPage onLogin={unlock} />;
};
