import { Capacitor } from '@capacitor/core';
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';

export const BIOMETRIC_LOCK_KEY = 'sipandu_biometric_lock_enabled';

export function isBiometricLockEnabled(): boolean {
  try {
    return Capacitor.isNativePlatform() && window.localStorage.getItem(BIOMETRIC_LOCK_KEY) === 'true';
  } catch {
    return false;
  }
}

export async function enableBiometricLock(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Pengaman biometrik hanya tersedia pada aplikasi Android native.');
  }
  const availability = await BiometricAuth.checkBiometry();
  if (!availability.isAvailable) {
    throw new Error(availability.reason || 'Sidik jari/face unlock belum tersedia untuk aplikasi. Daftarkan biometrik pada pengaturan perangkat terlebih dahulu.');
  }
  await BiometricAuth.authenticate({
    reason: 'Verifikasi identitas untuk mengaktifkan pengaman SIPANDU ODHIV',
    androidTitle: 'Aktifkan pengaman SIPANDU',
    androidSubtitle: 'Konfirmasi dengan sidik jari atau face unlock',
    allowDeviceCredential: true,
  });
  window.localStorage.setItem(BIOMETRIC_LOCK_KEY, 'true');
}

export async function authenticateBiometricLock(): Promise<void> {
  const availability = await BiometricAuth.checkBiometry();
  if (!availability.isAvailable) {
    throw new Error(availability.reason || 'Biometrik tidak tersedia. Gunakan autentikasi akun SIPANDU atau nonaktifkan pengaman biometrik.');
  }
  await BiometricAuth.authenticate({
    reason: 'Buka SIPANDU ODHIV',
    androidTitle: 'Pengaman SIPANDU ODHIV',
    androidSubtitle: 'Gunakan sidik jari atau face unlock',
    allowDeviceCredential: true,
  });
}

export function disableBiometricLock(): void {
  try { window.localStorage.removeItem(BIOMETRIC_LOCK_KEY); } catch { /* storage may be unavailable */ }
}
