import { Capacitor } from '@capacitor/core';
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';

export const BIOMETRIC_LOCK_KEY = 'sipandu_biometric_lock_enabled';

export interface BiometricDiagnostics {
  isAvailable: boolean;
  strongBiometryIsAvailable: boolean;
  deviceIsSecure: boolean;
  biometryType: string;
  biometryTypes: string[];
  reason: string;
  code: string;
  strongReason: string;
  strongCode: string;
}

export function isBiometricLockEnabled(): boolean {
  try {
    return Capacitor.isNativePlatform() && window.localStorage.getItem(BIOMETRIC_LOCK_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Report real native biometric capability without treating hardware presence alone
 * as proof that the Android app can use it. On Android, some face-unlock sensors
 * are only permitted for device unlock and cannot authenticate third-party apps.
 */
export async function getBiometricDiagnostics(): Promise<BiometricDiagnostics> {
  if (!Capacitor.isNativePlatform()) {
    return {
      isAvailable: false,
      strongBiometryIsAvailable: false,
      deviceIsSecure: false,
      biometryType: 'none',
      biometryTypes: [],
      reason: 'PWA/browser belum memiliki alur biometrik WebAuthn/passkey SIPANDU. Gunakan aplikasi native untuk pengaman biometrik.',
      code: 'web_pwa_not_supported',
      strongReason: '',
      strongCode: '',
    };
  }

  const result = await BiometricAuth.checkBiometry();
  return {
    isAvailable: Boolean(result.isAvailable),
    strongBiometryIsAvailable: Boolean(result.strongBiometryIsAvailable),
    deviceIsSecure: Boolean(result.deviceIsSecure),
    biometryType: String(result.biometryType || 'none'),
    biometryTypes: Array.isArray(result.biometryTypes) ? result.biometryTypes.map(String) : [],
    reason: String(result.reason || ''),
    code: String(result.code || ''),
    strongReason: String(result.strongReason || ''),
    strongCode: String(result.strongCode || ''),
  };
}

export async function enableBiometricLock(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Pengaman biometrik belum tersedia pada PWA/browser SIPANDU. Alur passkey/WebAuthn belum dikonfigurasi; gunakan aplikasi Android native.');
  }

  const availability = await getBiometricDiagnostics();
  if (!availability.isAvailable) {
    const code = availability.code ? ` (kode: ${availability.code})` : '';
    throw new Error(
      `${availability.reason || 'Sidik jari/face unlock belum tersedia untuk aplikasi.'}${code} Daftarkan biometrik pada pengaturan perangkat dan pastikan perangkat mengizinkan aplikasi menggunakan biometrik.`
    );
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
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Pengaman biometrik native tidak tersedia di PWA/browser SIPANDU.');
  }

  const availability = await getBiometricDiagnostics();
  if (!availability.isAvailable) {
    const code = availability.code ? ` (kode: ${availability.code})` : '';
    throw new Error(
      `${availability.reason || 'Biometrik tidak tersedia. Periksa sidik jari/face unlock dan keamanan perangkat.'}${code}`
    );
  }

  await BiometricAuth.authenticate({
    reason: 'Buka SIPANDU ODHIV',
    androidTitle: 'Pengaman SIPANDU ODHIV',
    androidSubtitle: 'Gunakan sidik jari atau face unlock',
    allowDeviceCredential: true,
  });
}

export function disableBiometricLock(): void {
  try {
    window.localStorage.removeItem(BIOMETRIC_LOCK_KEY);
  } catch {
    /* storage may be unavailable */
  }
}
