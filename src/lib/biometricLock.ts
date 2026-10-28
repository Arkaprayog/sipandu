import { Capacitor } from '@capacitor/core';
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';
import { isAppPinFormatValid } from './pinPolicy';

export const BIOMETRIC_LOCK_KEY = 'sipandu_biometric_lock_enabled';
const BIOMETRIC_USER_KEY = 'sipandu_biometric_lock_user_v1';
const APP_PIN_HASH_KEY = 'sipandu_app_pin_hash_v1';
const APP_PIN_SALT_KEY = 'sipandu_app_pin_salt_v1';
const APP_PIN_USER_KEY = 'sipandu_app_pin_user_v1';
const APP_PIN_FAILURES_KEY = 'sipandu_app_pin_failures_v1';
const WEBAUTHN_CREDENTIAL_KEY = 'sipandu_platform_credential_v1';
const PIN_KDF_ITERATIONS = 210_000;
const PIN_MAX_ATTEMPTS = 5;

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

export interface QuickUnlockUser {
  uid: string;
  email?: string | null;
  displayName?: string | null;
}

interface StoredPlatformCredential {
  credentialId: string;
  rpId: string;
  userId: string;
  createdAt: number;
}

export interface PinVerificationResult {
  ok: boolean;
  message?: string;
  retryAfterMs?: number;
}

function storage(): Storage {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      throw new Error('Penyimpanan perangkat tidak tersedia.');
    }
    return window.localStorage;
  } catch {
    throw new Error('Penyimpanan aman browser tidak tersedia. Periksa mode privat atau izin penyimpanan aplikasi.');
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(value: string): Uint8Array<ArrayBuffer> {
  if (!/^(?:[0-9a-f]{2})+$/i.test(value)) throw new Error('Data PIN rusak. Daftarkan ulang PIN.');
  const result = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    result[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return result;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

async function derivePinHash(pin: string, salt: Uint8Array<ArrayBuffer>): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Enkripsi perangkat tidak tersedia. Buka SIPANDU melalui HTTPS dan peramban terbaru.');
  }
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const digest = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    salt,
    iterations: PIN_KDF_ITERATIONS,
    hash: 'SHA-256',
  }, key, 256);
  return bytesToHex(new Uint8Array(digest));
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function readPinFailures(): { count: number; lockedUntil: number } {
  try {
    const raw = storage().getItem(APP_PIN_FAILURES_KEY);
    if (!raw) return { count: 0, lockedUntil: 0 };
    const parsed = JSON.parse(raw) as { count?: unknown; lockedUntil?: unknown };
    return {
      count: Number.isFinite(parsed.count) ? Math.max(0, Number(parsed.count)) : 0,
      lockedUntil: Number.isFinite(parsed.lockedUntil) ? Math.max(0, Number(parsed.lockedUntil)) : 0,
    };
  } catch {
    return { count: 0, lockedUntil: 0 };
  }
}

function writePinFailures(count: number, lockedUntil = 0): void {
  storage().setItem(APP_PIN_FAILURES_KEY, JSON.stringify({ count, lockedUntil }));
}

function getStoredPlatformCredential(): StoredPlatformCredential | null {
  try {
    const raw = storage().getItem(WEBAUTHN_CREDENTIAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredPlatformCredential>;
    if (
      typeof parsed.credentialId !== 'string' ||
      typeof parsed.rpId !== 'string' ||
      typeof parsed.userId !== 'string' ||
      typeof parsed.createdAt !== 'number'
    ) return null;
    return parsed as StoredPlatformCredential;
  } catch {
    return null;
  }
}

function isPlatformAuthenticatorSupported(): boolean {
  return typeof window !== 'undefined' &&
    window.isSecureContext &&
    typeof navigator !== 'undefined' &&
    !!navigator.credentials &&
    typeof PublicKeyCredential !== 'undefined';
}

export function isAppPinConfigured(userId?: string): boolean {
  try {
    const s = storage();
    if (!s.getItem(APP_PIN_HASH_KEY) || !s.getItem(APP_PIN_SALT_KEY)) return false;
    const owner = s.getItem(APP_PIN_USER_KEY);
    return !userId || owner === userId;
  } catch {
    return false;
  }
}

export function isBiometricLockEnabled(userId?: string): boolean {
  try {
    const s = storage();
    if (s.getItem(BIOMETRIC_LOCK_KEY) !== 'true') return false;
    const owner = s.getItem(BIOMETRIC_USER_KEY);
    // Upgrade an older native preference once, binding it to the active Firebase user.
    if (!owner && userId) s.setItem(BIOMETRIC_USER_KEY, userId);
    return !owner || !userId || owner === userId;
  } catch {
    return false;
  }
}

/** Whether the current signed-in account has any local quick-unlock method configured. */
export function isQuickUnlockEnabled(userId?: string): boolean {
  return isBiometricLockEnabled(userId) || isAppPinConfigured(userId);
}

export function isPlatformBiometricRegistered(userId?: string): boolean {
  const credential = getStoredPlatformCredential();
  return !!credential && (!userId || credential.userId === userId) && credential.rpId === window.location.hostname;
}

/**
 * Report native biometric capability or browser WebAuthn platform-authenticator support.
 * The operating system selects an enrolled face or fingerprint method; apps cannot reliably
 * force the order of biometric modalities on all Android devices.
 */
export async function getBiometricDiagnostics(): Promise<BiometricDiagnostics> {
  if (!Capacitor.isNativePlatform()) {
    const available = isPlatformAuthenticatorSupported();
    return {
      isAvailable: available,
      strongBiometryIsAvailable: available,
      deviceIsSecure: typeof window !== 'undefined' && window.isSecureContext,
      biometryType: available ? 'Passkey/WebAuthn' : 'none',
      biometryTypes: available ? ['Autentikator perangkat (wajah/sidik jari sesuai perangkat)'] : [],
      reason: available
        ? 'Browser mendukung WebAuthn melalui HTTPS. Daftarkan autentikator perangkat ini dari Pengaturan SIPANDU.'
        : 'WebAuthn belum tersedia. Buka melalui HTTPS di browser Android terbaru yang mendukung autentikator platform.',
      code: available ? '' : 'webauthn_platform_unavailable',
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

async function registerPlatformAuthenticator(user: QuickUnlockUser): Promise<void> {
  if (!isPlatformAuthenticatorSupported()) {
    throw new Error('Browser ini belum mendukung WebAuthn. Pastikan SIPANDU dibuka lewat HTTPS di browser Android yang terbaru.');
  }
  if (!user.uid) throw new Error('Sesi akun SIPANDU tidak ditemukan. Masuk dengan akun resmi terlebih dahulu.');

  const publicKey: PublicKeyCredentialCreationOptions = {
    challenge: randomBytes(32),
    rp: { name: 'SIPANDU ODHIV', id: window.location.hostname },
    user: {
      id: new TextEncoder().encode(user.uid),
      name: user.email || user.uid,
      displayName: user.displayName || user.email || 'Petugas SIPANDU',
    },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 },
      { type: 'public-key', alg: -257 },
    ],
    timeout: 60_000,
    attestation: 'none',
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      residentKey: 'preferred',
      userVerification: 'required',
    },
  };

  let credential: Credential | null;
  try {
    credential = await navigator.credentials.create({ publicKey });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Permintaan autentikator dibatalkan.';
    throw new Error('Pendaftaran biometrik PWA tidak berhasil: ' + message);
  }
  if (!(credential instanceof PublicKeyCredential)) {
    throw new Error('Browser tidak mengembalikan kredensial perangkat yang valid.');
  }

  const record: StoredPlatformCredential = {
    credentialId: toBase64Url(new Uint8Array(credential.rawId)),
    rpId: window.location.hostname,
    userId: user.uid,
    createdAt: Date.now(),
  };
  storage().setItem(WEBAUTHN_CREDENTIAL_KEY, JSON.stringify(record));
}

export async function enableBiometricLock(user?: QuickUnlockUser): Promise<void> {
  if (!user?.uid) {
    throw new Error('Sesi akun SIPANDU tidak ditemukan. Masuk dengan akun resmi sebelum mendaftarkan biometrik.');
  }
  if (!isAppPinConfigured(user.uid)) {
    throw new Error('Daftarkan PIN SIPANDU 4 angka terlebih dahulu. PIN wajib tersedia sebagai cadangan jika biometrik gagal.');
  }

  if (!Capacitor.isNativePlatform()) {
    await registerPlatformAuthenticator(user);
    storage().setItem(BIOMETRIC_USER_KEY, user.uid);
    storage().setItem(BIOMETRIC_LOCK_KEY, 'true');
    return;
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
    allowDeviceCredential: false,
  });
  storage().setItem(BIOMETRIC_USER_KEY, user.uid);
  storage().setItem(BIOMETRIC_LOCK_KEY, 'true');
}

export async function authenticateBiometricLock(userId?: string): Promise<void> {
  if (!isBiometricLockEnabled(userId)) {
    throw new Error('Biometrik belum diaktifkan untuk akun ini. Gunakan PIN atau aktifkan biometrik melalui Pengaturan.');
  }

  if (!Capacitor.isNativePlatform()) {
    const stored = getStoredPlatformCredential();
    if (!stored || (userId && stored.userId !== userId) || stored.rpId !== window.location.hostname) {
      throw new Error('Biometrik PWA belum terdaftar untuk akun dan alamat SIPANDU ini. Daftarkan ulang dari Pengaturan.');
    }
    if (!isPlatformAuthenticatorSupported()) {
      throw new Error('Autentikator perangkat tidak tersedia di browser ini. Gunakan PIN SIPANDU.');
    }

    const publicKey: PublicKeyCredentialRequestOptions = {
      challenge: randomBytes(32),
      rpId: stored.rpId,
      allowCredentials: [{
        type: 'public-key',
        id: fromBase64Url(stored.credentialId),
      }],
      timeout: 60_000,
      userVerification: 'required',
    };
    let assertion: Credential | null;
    try {
      assertion = await navigator.credentials.get({ publicKey });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Verifikasi perangkat dibatalkan.';
      throw new Error('Verifikasi WebAuthn tidak berhasil: ' + message);
    }
    if (!(assertion instanceof PublicKeyCredential) ||
        toBase64Url(new Uint8Array(assertion.rawId)) !== stored.credentialId) {
      throw new Error('Autentikator yang digunakan tidak cocok dengan perangkat yang didaftarkan.');
    }
    return;
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
    allowDeviceCredential: false,
  });
}

export function disableBiometricLock(): void {
  try {
    const s = storage();
    s.removeItem(BIOMETRIC_LOCK_KEY);
    s.removeItem(BIOMETRIC_USER_KEY);
    s.removeItem(WEBAUTHN_CREDENTIAL_KEY);
  } catch {
    /* storage may be unavailable */
  }
}

/** Reset only local quick-unlock secrets; Firebase account authentication is unchanged. */
export function resetQuickUnlockSettings(): void {
  try {
    const s = storage();
    [
      BIOMETRIC_LOCK_KEY,
      BIOMETRIC_USER_KEY,
      APP_PIN_HASH_KEY,
      APP_PIN_SALT_KEY,
      APP_PIN_USER_KEY,
      APP_PIN_FAILURES_KEY,
      WEBAUTHN_CREDENTIAL_KEY,
    ].forEach((key) => s.removeItem(key));
  } catch {
    /* storage may be unavailable */
  }
}

/** Store only a salted PBKDF2 verifier; never store the four-digit PIN itself. */
export async function setAppPin(pin: string, confirmation: string, userId: string): Promise<void> {
  if (!userId) throw new Error('Sesi akun SIPANDU tidak ditemukan. Masuk kembali sebelum membuat PIN.');
  if (!isAppPinFormatValid(pin)) throw new Error('PIN harus terdiri tepat dari 4 angka.');
  if (pin !== confirmation) throw new Error('Konfirmasi PIN tidak cocok.');
  if (!globalThis.crypto?.subtle) throw new Error('Enkripsi tidak tersedia. Gunakan SIPANDU melalui HTTPS atau aplikasi Android resmi.');

  const s = storage();
  const salt = randomBytes(16);
  const hash = await derivePinHash(pin, salt);
  s.setItem(APP_PIN_SALT_KEY, bytesToHex(salt));
  s.setItem(APP_PIN_HASH_KEY, hash);
  s.setItem(APP_PIN_USER_KEY, userId);
  writePinFailures(0);
}

export async function verifyAppPin(pin: string, userId: string): Promise<PinVerificationResult> {
  if (!isAppPinConfigured(userId)) {
    return { ok: false, message: 'PIN belum terdaftar untuk akun ini. Masuk dengan akun SIPANDU lalu daftarkan PIN melalui Pengaturan.' };
  }
  if (!isAppPinFormatValid(pin)) return { ok: false, message: 'Masukkan PIN yang terdiri dari 4 angka.' };

  const failures = readPinFailures();
  const now = Date.now();
  if (failures.lockedUntil > now) {
    const retryAfterMs = failures.lockedUntil - now;
    return { ok: false, retryAfterMs, message: `Terlalu banyak percobaan PIN. Coba lagi dalam ${Math.ceil(retryAfterMs / 1000)} detik.` };
  }

  const s = storage();
  const saltValue = s.getItem(APP_PIN_SALT_KEY);
  const expectedHash = s.getItem(APP_PIN_HASH_KEY);
  if (!saltValue || !expectedHash) return { ok: false, message: 'Data PIN tidak lengkap. Daftarkan ulang PIN dari Pengaturan.' };

  const valid = constantTimeEqual(await derivePinHash(pin, hexToBytes(saltValue)), expectedHash);
  if (valid) {
    writePinFailures(0);
    return { ok: true };
  }

  const nextCount = failures.count + 1;
  let delay = 0;
  if (nextCount >= PIN_MAX_ATTEMPTS) {
    delay = nextCount >= 9 ? 15 * 60_000 : nextCount >= 7 ? 5 * 60_000 : nextCount === 6 ? 60_000 : 30_000;
  }
  writePinFailures(nextCount, delay ? now + delay : 0);
  return {
    ok: false,
    retryAfterMs: delay || undefined,
    message: delay
      ? `PIN salah. Batas percobaan tercapai; coba lagi dalam ${Math.ceil(delay / 1000)} detik atau gunakan biometrik.`
      : `PIN salah. Sisa percobaan sebelum jeda: ${Math.max(0, PIN_MAX_ATTEMPTS - nextCount)}.`,
  };
}
