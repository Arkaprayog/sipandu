import { initializeApp, getApps } from 'firebase/app';
import { Capacitor } from '@capacitor/core';
import { SocialLogin } from '@capgo/capacitor-social-login';
import {
  getFirestore,
  doc,
  collection,
  addDoc,
  serverTimestamp,
  getDocs,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  limit,
  where,
  orderBy,
  runTransaction,
} from 'firebase/firestore';
import {
  getAuth,
  initializeAuth,
  type Auth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  setPersistence,
  signInWithPopup,
  reauthenticateWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signInWithCredential,
  onAuthStateChanged,
  User,
  signOut,
  getIdTokenResult,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { PPKSRecord, ProfileUser, StageOneIntakePayload, PPKSServiceStatus, PPKSServiceEvent, PPKSServiceUpdateInput, FieldVisitRecord, SecurityAuditEntry } from '../types';
import { deduplicatePPKSRecords, parsePPKSTimestamp, samePPKSIdentity } from './ppksData';
import { isLegacySamplePPKS } from '../data/initialData';
import { GOOGLE_WORKSPACE_EMAIL } from './googleSIPANDUResources';
import { normalizePPKSPhotoSource } from './photoSources';
import { isIntegratedAssessmentAnswerKey } from './integratedAssessmentArchive';

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore with custom databaseId if provided
export const db = firebaseConfig.firestoreDatabaseId
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

// App authentication and Google Workspace OAuth must be isolated.
// Using the primary auth for a Workspace popup replaced the staff session with
// the Google account and could trigger the app's role-check logout.
const workspaceApp = getApps().find((candidate) => candidate.name === 'sipandu-workspace-auth')
  || initializeApp(firebaseConfig, 'sipandu-workspace-auth');

// Initialize the staff session with durable browser storage before the first
// auth-state listener is registered. Android's file picker can background or
// recreate the Capacitor Activity; IndexedDB persistence is preferred there,
// with localStorage as a compatibility fallback. The PWA uses localStorage first.
const staffAuthPersistences = Capacitor.isNativePlatform()
  ? [indexedDBLocalPersistence, browserLocalPersistence]
  : [browserLocalPersistence, indexedDBLocalPersistence];

let staffAuth: Auth;
try {
  staffAuth = initializeAuth(app, { persistence: staffAuthPersistences });
} catch (error) {
  // getAuth returns the existing singleton if another module initialized it first.
  console.warn('SIPANDU used the existing Firebase Auth instance:', error);
  staffAuth = getAuth(app);
}
export const auth = staffAuth;
// Auth's own readiness promise prevents the UI from treating the initial storage
// restore as a signed-out state. Only the explicit Keluar action calls signOut(auth).
export const staffAuthPersistenceReady = auth.authStateReady();
export const workspaceAuth = getAuth(workspaceApp);

// Configure Google Auth Provider with Workspace scopes
export const googleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.setCustomParameters({
  login_hint: GOOGLE_WORKSPACE_EMAIL,
  // Always show the account chooser: login_hint alone can silently reuse a
  // previously active Google identity in mobile browsers.
  prompt: 'select_account',
});
// Ask explicitly for identity scopes in addition to the Google API scopes.
googleAuthProvider.addScope('email');
googleAuthProvider.addScope('profile');
googleAuthProvider.addScope('https://www.googleapis.com/auth/drive.readonly');
googleAuthProvider.addScope('https://www.googleapis.com/auth/drive.file');
googleAuthProvider.addScope('https://www.googleapis.com/auth/spreadsheets');
googleAuthProvider.addScope('https://www.googleapis.com/auth/forms.body.readonly');
googleAuthProvider.addScope('https://www.googleapis.com/auth/forms.responses.readonly');

// Google access tokens are short-lived. Keep them only in sessionStorage (not
// localStorage) so a page reload in the same tab does not force an immediate
// reconnect, and discard them conservatively before Google's usual 1-hour expiry.
const WORKSPACE_TOKEN_STORAGE_KEY = 'sipandu_google_workspace_token_v1';
// SIPANDU policy: require explicit Google Workspace re-login every 90 days.
// Store only the authorization timestamp, never a refresh token or secret.
const WORKSPACE_AUTHORIZED_AT_KEY = 'sipandu_google_workspace_authorized_at_v1';
export const WORKSPACE_REAUTH_INTERVAL_MS = 90 * 24 * 60 * 60 * 1000;
const WORKSPACE_TOKEN_TTL_MS = 55 * 60 * 1000;
// Proactively renew before expiry so the two-minute live-sync and private photos
// usually continue without a manual "Pulihkan Izin" click.
const WORKSPACE_TOKEN_REFRESH_AFTER_MS = 42 * 60 * 1000;
const WORKSPACE_TOKEN_REFRESH_RETRY_MS = 5 * 60 * 1000;
let cachedAccessTokenSavedAt = 0;
let lastWorkspaceAutoRefreshAttemptAt = 0;
let workspaceTokenRefreshInFlight: Promise<string | null> | null = null;

function getWorkspaceAuthorizedAt(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(WORKSPACE_AUTHORIZED_AT_KEY);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 && value <= Date.now() ? value : null;
  } catch {
    return null;
  }
}

/** True until a successful explicit Google Workspace login starts a 90-day window. */
export function isWorkspaceAuthorizationExpired(): boolean {
  const authorizedAt = getWorkspaceAuthorizedAt();
  return authorizedAt === null || Date.now() - authorizedAt >= WORKSPACE_REAUTH_INTERVAL_MS;
}

function markWorkspaceAuthorization(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(WORKSPACE_AUTHORIZED_AT_KEY, String(Date.now()));
  } catch {
    // If persistent storage is unavailable, fail closed on the next session.
  }
}

function readStoredWorkspaceToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(WORKSPACE_TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { token?: unknown; savedAt?: unknown };
    if (
      typeof saved.token !== 'string' ||
      typeof saved.savedAt !== 'number' ||
      Date.now() - saved.savedAt < 0 ||
      Date.now() - saved.savedAt >= WORKSPACE_TOKEN_TTL_MS
    ) {
      window.sessionStorage.removeItem(WORKSPACE_TOKEN_STORAGE_KEY);
      return null;
    }
    cachedAccessTokenSavedAt = saved.savedAt;
    return saved.token;
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
    return null;
  }
}

function cacheWorkspaceToken(token: string | null, notify = true): void {
  cachedAccessToken = token;
  cachedAccessTokenSavedAt = token ? Date.now() : 0;
  if (typeof window === 'undefined') return;
  try {
    if (!token) {
      window.sessionStorage.removeItem(WORKSPACE_TOKEN_STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(
        WORKSPACE_TOKEN_STORAGE_KEY,
        JSON.stringify({ token, savedAt: Date.now() })
      );
    }
  } catch {
    // Keep the current-page session working even when browser storage is blocked.
  }
  // Wake the in-page live-sync worker immediately after authorization is restored.
  if (notify) window.dispatchEvent(new CustomEvent('sipandu-workspace-token-updated', {
    detail: { connected: Boolean(token) },
  }));
}

let cachedAccessToken: string | null = readStoredWorkspaceToken();

export type ConnectionCheckResult = {
  service: 'Firebase Auth' | 'Firestore';
  ok: boolean;
  message: string;
  checkedAt: string;
};

const VALID_ROLES = ['owner', 'supervisor', 'pendamping'] as const;
type SipanduRole = typeof VALID_ROLES[number];

/** Resolve the Google email from the primary Firebase user field or Google provider profile. */
export function getWorkspaceGoogleEmail(user: User | null | undefined): string | null {
  if (!user) return null;
  const directEmail = user.email?.trim();
  if (directEmail) return directEmail;
  const googleProfile = user.providerData.find((profile) => profile.providerId === 'google.com');
  const providerEmail = googleProfile?.email?.trim();
  return providerEmail || null;
}

/** True only when the expected Google Workspace identity is already connected. */
export function isWorkspaceAccountConnected(): boolean {
  const email = getWorkspaceGoogleEmail(workspaceAuth.currentUser);
  return Boolean(email && email.toLowerCase() === GOOGLE_WORKSPACE_EMAIL.toLowerCase());
}

function getErrorParts(error: unknown): { code: string; message: string } {
  const e = error as { code?: string; message?: string };
  return {
    code: e?.code ? String(e.code) : 'unknown',
    message: e?.message || (error instanceof Error ? error.message : String(error)),
  };
}

function describeConnectionError(error: unknown): string {
  const { code, message } = getErrorParts(error);
  if (code.includes('permission-denied')) {
    return 'Firestore menolak akses (permission-denied). Periksa custom claim role akun, Firestore Rules, dan pastikan Rules diterapkan ke database SIPANDU yang benar.';
  }
  if (code.includes('unavailable') || /offline|network|timeout/i.test(message)) {
    return 'Firestore tidak dapat dijangkau. Periksa jaringan, status layanan Firebase, dan konfigurasi database.';
  }
  if (code.includes('unauthenticated')) return 'Sesi Firebase tidak terautentikasi. Keluar lalu masuk kembali dengan akun SIPANDU yang berwenang.';
  return `Kode: ${code}. ${message}`;
}

/** Checks real read access to the protected ppks collection without exposing record data. */
export async function testFirestoreConnection(): Promise<ConnectionCheckResult> {
  const checkedAt = new Date().toISOString();
  const user = auth.currentUser;
  if (!user) {
    return { service: 'Firestore', ok: false, message: 'Belum ada sesi akun SIPANDU yang aktif. Masuk dengan akun staf terlebih dahulu.', checkedAt };
  }
  try {
    const token = await getIdTokenResult(user, true);
    const role = token.claims.role;
    if (!VALID_ROLES.includes(role as SipanduRole)) {
      return {
        service: 'Firestore',
        ok: false,
        message: `Akun ${user.email || user.uid} tidak memiliki custom claim role yang valid. Peran yang terbaca: ${role ? String(role) : 'tidak ada'}. Admin harus menetapkan role tepercaya di Firebase Admin SDK.`,
        checkedAt,
      };
    }

    await getDocs(query(collection(db, 'ppks'), limit(1)));
    const canWrite = role === 'owner' || role === 'supervisor';
    return {
      service: 'Firestore',
      ok: true,
      message: `Pembacaan server pada koleksi ppks berhasil. Peran: ${role}. ${canWrite ? 'Rules mengizinkan tulis bagi peran ini; operasi simpan tetap harus diuji saat sinkronisasi.' : 'Peran pendamping hanya memiliki akses baca sesuai Firestore Rules dan tidak dapat menulis data PPKS.'}`,
      checkedAt,
    };
  } catch (error) {
    return { service: 'Firestore', ok: false, message: describeConnectionError(error), checkedAt };
  }
}

export async function testFirebaseAuthConnection(): Promise<ConnectionCheckResult> {
  const checkedAt = new Date().toISOString();
  try {
    if (!auth.app.options.apiKey || !auth.app.options.projectId) {
      throw new Error('Konfigurasi Firebase apiKey/projectId tidak lengkap.');
    }
    const user = auth.currentUser;
    if (!user) {
      return { service: 'Firebase Auth', ok: false, message: 'SDK dikonfigurasi tetapi akun staf belum masuk.', checkedAt };
    }
    const token = await getIdTokenResult(user, true);
    const role = token.claims.role;
    if (!VALID_ROLES.includes(role as SipanduRole)) {
      return { service: 'Firebase Auth', ok: false, message: `Sesi aktif sebagai ${user.email || user.uid}, tetapi custom claim role tidak valid (${role ? String(role) : 'tidak ada'}).`, checkedAt };
    }
    return { service: 'Firebase Auth', ok: true, message: `Firebase Auth aktif untuk ${user.email || 'akun tanpa email'}; role terverifikasi: ${role}.`, checkedAt };
  } catch (error) {
    return { service: 'Firebase Auth', ok: false, message: describeConnectionError(error), checkedAt };
  }
}

/**
 * Validates a Workspace identity and stores its scoped API token.
 * Shared by popup and redirect sign-in flows.
 */
async function finishWorkspaceSignIn(result: import('firebase/auth').UserCredential, recordAuthorization = true): Promise<{
  user: User;
  accessToken: string;
}> {
  const selectedEmail = getWorkspaceGoogleEmail(result.user);
  if (!selectedEmail) {
    try { await signOut(workspaceAuth); } catch { /* retain the actionable email-scope error below */ }
    cacheWorkspaceToken(null);
    throw new Error(
      'Google berhasil membuka sesi, tetapi alamat email tidak dikirim ke SIPANDU. Pilih akun yang benar dan izinkan akses profil/email. Jika email tetap kosong, admin perlu memeriksa penyedia Google pada Firebase Authentication.'
    );
  }
  if (selectedEmail.toLowerCase() !== GOOGLE_WORKSPACE_EMAIL.toLowerCase()) {
    try { await signOut(workspaceAuth); } catch { /* preserve account-mismatch message */ }
    cacheWorkspaceToken(null);
    throw new Error(`Sumber data SIPANDU dibagikan ke ${GOOGLE_WORKSPACE_EMAIL}. Akun yang dipilih adalah ${selectedEmail}; pilih ${GOOGLE_WORKSPACE_EMAIL} pada pemilih akun Google lalu ulangi.`);
  }
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential?.accessToken) {
    cacheWorkspaceToken(null);
    throw new Error('Google berhasil mengautentikasi identitas, tetapi tidak memberikan access token untuk Drive/Sheets/Forms. Periksa persetujuan OAuth dan scope Google API.');
  }
  if (recordAuthorization) markWorkspaceAuthorization();
  cacheWorkspaceToken(credential.accessToken);
  return { user: result.user, accessToken: credential.accessToken };
}

function describeGoogleOAuthError(error: unknown): string {
  const { code, message } = getErrorParts(error);
  if (code.includes('auth/unauthorized-domain')) {
    const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
    const projectId = auth.app.options.projectId || 'gen-lang-client-0197631978';
    const domainHint = hostname ? `Tambahkan domain persis ini: ${hostname} (hanya hostname, tanpa https://, port, atau path). ` : 'Tambahkan hostname yang terlihat di bilah alamat aplikasi, tanpa https://, port, atau path. ';
    return `Domain aplikasi "${hostname || '(tidak terdeteksi)'}" belum diizinkan pada Firebase Authentication. Ini adalah pengaturan Firebase, bukan Cloudflare. Buka https://console.firebase.google.com/project/${projectId}/authentication/settings, cari Authorized domains, lalu pilih Add domain. ${domainHint}Simpan perubahan, tunggu sebentar, muat ulang aplikasi, lalu ulangi login. Jika masih gagal, pastikan Google aktif di Authentication > Sign-in method.`;
  }
  if (code.includes('auth/operation-not-allowed')) {
    return 'Penyedia Google belum diaktifkan pada Firebase Authentication. Admin harus membuka Firebase Console > Authentication > Sign-in method dan mengaktifkan Google pada proyek gen-lang-client-0197631978.';
  }
  if (code.includes('auth/popup-blocked')) {
    return 'Popup Google diblokir browser. SIPANDU akan mencoba beralih ke halaman login Google penuh.';
  }
  if (code.includes('auth/operation-not-supported-in-this-environment')) {
    return 'Browser tidak mendukung login Google lewat popup. SIPANDU akan mencoba beralih ke halaman login Google penuh.';
  }
  if (code.includes('auth/popup-closed-by-user')) {
    return 'Jendela otorisasi Google ditutup sebelum selesai. Ulangi dan selesaikan persetujuan.';
  }
  if (code.includes('auth/cancelled-popup-request')) {
    return 'Ada permintaan popup Google lain yang masih berjalan. Tutup popup duplikat lalu tekan tombol login sekali saja.';
  }
  if (code.includes('auth/network-request-failed')) {
    return 'Login Google gagal karena jaringan atau pemblokiran browser. Periksa koneksi internet lalu ulangi.';
  }
  if (code.includes('auth/web-storage-unsupported')) {
    return 'Browser memblokir penyimpanan yang dibutuhkan Firebase Authentication. Buka SIPANDU langsung di Chrome atau browser eksternal dan izinkan cookie/penyimpanan situs.';
  }
  if (code.includes('auth/invalid-oauth-client-id') || code.includes('redirect_uri_mismatch') || code.includes('origin_mismatch')) {
    return `Konfigurasi OAuth Google tidak cocok dengan aplikasi ini (${code}). Admin harus memeriksa OAuth client ID, JavaScript origins, serta redirect URI pada Google Cloud Console. Detail: ${message}`;
  }
  if (code) return `Login Google gagal (${code}): ${message}`;
  return message || (error instanceof Error ? error.message : String(error));
}

/**
 * Attempts a popup first; mobile/embedded browsers fall back to the full-page
 * redirect flow, whose result is processed after the page returns from Google.
 */
function buildWorkspaceProvider(prompt?: 'none' | 'select_account' | 'consent' | 'select_account consent'): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({
    login_hint: GOOGLE_WORKSPACE_EMAIL,
    ...(prompt ? { prompt } : {}),
  });
  provider.addScope('email');
  provider.addScope('profile');
  provider.addScope('https://www.googleapis.com/auth/drive.readonly');
  provider.addScope('https://www.googleapis.com/auth/drive.file');
  provider.addScope('https://www.googleapis.com/auth/spreadsheets');
  provider.addScope('https://www.googleapis.com/auth/forms.body.readonly');
  provider.addScope('https://www.googleapis.com/auth/forms.responses.readonly');
  return provider;
}

let nativeGoogleSignInInitialized = false;

async function initializeNativeGoogleSignIn(): Promise<void> {
  // Re-running initialize recreates the provider with the current native Activity.
  // This is important if the Android app was resumed/recreated before a login tap.
  await SocialLogin.initialize({
    google: {
      webClientId: firebaseConfig.oAuthClientId,
      mode: 'online',
    },
  });
  nativeGoogleSignInInitialized = true;
}

function nativeGoogleErrorMessage(error: unknown): string {
  const candidate = error as { message?: unknown };
  return typeof candidate?.message === 'string'
    ? candidate.message
    : error instanceof Error ? error.message : String(error);
}

export const googleSignIn = async (): Promise<{
  user: User;
  accessToken: string;
} | null> => {
  // Keep the Workspace identity across reloads; the short-lived Google API
  // access token is still held only in sessionStorage for security.
  await setPersistence(workspaceAuth, browserLocalPersistence);

  // Android/iOS must use the operating-system Google sign-in flow. Firebase JS
  // popup/redirect OAuth runs on Capacitor's localhost origin and is unreliable
  // or rejected inside a WebView. The native plugin returns both an ID token for
  // Firebase identity and a scoped Google API access token for Drive/Sheets/Forms.
  if (Capacitor.isNativePlatform()) {
    try {
      const nativeScopes = [
        'email',
        'profile',
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/forms.body.readonly',
        'https://www.googleapis.com/auth/forms.responses.readonly',
      ];
      const requestNativeLogin = () => SocialLogin.login({
        provider: 'google',
        options: {
          scopes: nativeScopes,
          // Make the account picker explicit and avoid forcing a refresh of a
          // cached token, which can trigger Credential Manager error [16].
          style: 'standard',
          filterByAuthorizedAccounts: false,
          autoSelectEnabled: false,
          forceRefreshToken: false,
        },
      });

      let nativeResponse: any = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          if (!nativeGoogleSignInInitialized) await initializeNativeGoogleSignIn();
          nativeResponse = await requestNativeLogin();
          break;
        } catch (loginError) {
          const loginMessage = nativeGoogleErrorMessage(loginError);
          const missingActivityBridge = /You CANNOT use scopes without modifying the main activity/i.test(loginMessage);
          if (!missingActivityBridge || attempt !== 0) throw loginError;

          // Retry once with a fresh provider/Activity binding. If the installed APK
          // truly lacks the interface, the second attempt remains a clear hard failure.
          nativeGoogleSignInInitialized = false;
          await initializeNativeGoogleSignIn();
        }
      }
      if (!nativeResponse) {
        throw new Error('Native Google login ended without a response after reinitializing the provider.');
      }
      const nativeResult = nativeResponse?.result;
      const selectedEmail = nativeResult?.profile?.email?.trim();
      if (!selectedEmail || selectedEmail.toLowerCase() !== GOOGLE_WORKSPACE_EMAIL.toLowerCase()) {
        try { await SocialLogin.logout({ provider: 'google' }); } catch { /* keep the account mismatch as the main error */ }
        cacheWorkspaceToken(null);
        throw new Error(
          `Pilih akun Google ${GOOGLE_WORKSPACE_EMAIL}. Akun yang dipilih: ${selectedEmail || 'email tidak tersedia'}.`
        );
      }
      const idToken = nativeResult?.idToken;
      const accessToken = typeof nativeResult?.accessToken === 'string'
        ? nativeResult.accessToken
        : nativeResult?.accessToken?.token;
      if (!idToken) {
        throw new Error('Google Sign-In native tidak mengembalikan ID token. Periksa Web OAuth Client ID pada Firebase/Google Cloud.');
      }
      if (!accessToken) {
        throw new Error('Login berhasil, tetapi token Google API tidak tersedia. Ulangi persetujuan akses Drive, Sheets, dan Forms.');
      }

      const firebaseCredential = GoogleAuthProvider.credential(idToken);
      const userCredential = await signInWithCredential(workspaceAuth, firebaseCredential);
      markWorkspaceAuthorization();
      cacheWorkspaceToken(accessToken);
      return { user: userCredential.user, accessToken };
    } catch (error: unknown) {
      cacheWorkspaceToken(null);
      const message = nativeGoogleErrorMessage(error);
      if (/You CANNOT use scopes without modifying the main activity/i.test(message)) {
        throw new Error(
          'Login Google native gagal karena MainActivity pada APK yang sedang berjalan tidak memuat bridge izin Google API. Ini bukan kesalahan SHA-1. Tutup aplikasi sepenuhnya lalu pasang ulang APK SIPANDU ODHIV Release v2.2.1 atau versi terbaru dari GitHub Releases. Jika error tetap muncul di versi terbaru, kirim tangkapan layar versi aplikasi pada perangkat agar build yang terpasang dapat dibandingkan dengan APK yang diverifikasi CI.'
        );
      }
      if (/DEVELOPER_ERROR|status code:?\s*10|\[28444\]/i.test(message)) {
        throw new Error(
          `Login Google native gagal karena konfigurasi OAuth Android (DEVELOPER_ERROR). Periksa OAuth client ID, package id.my.sipandu.odhiv, serta SHA-1 sertifikat penandatangan APK Release pada proyek Firebase/Google Cloud gen-lang-client-0197631978. Detail: ${message}`
        );
      }
      throw new Error(`Login Google native SIPANDU gagal: ${message}`);
    }
  }

  // Google blocks popup-based OAuth in many mobile and embedded WebViews.
  // Start a top-level redirect directly from the user's tap on those clients.
  // The result is consumed by completeGoogleRedirectSignIn during app startup.
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  // Do not force every Android/iOS browser through redirect OAuth. On Chrome
  // mobile, popup sign-in is often the reliable path; redirect can appear to do
  // nothing when the host uses a different authDomain and blocks third-party
  // redirect storage. Reserve redirect-first for an actual embedded WebView.
  const isEmbeddedWebView =
    /;\s*wv\)|\bwv\b|webview|capacitor/i.test(userAgent) ||
    ((/iPhone|iPad|iPod/i.test(userAgent)) &&
      /AppleWebKit/i.test(userAgent) && !/Safari/i.test(userAgent));
  if (isEmbeddedWebView) {
    const provider = buildWorkspaceProvider('select_account consent');
    try {
      await signInWithRedirect(workspaceAuth, provider);
      return null;
    } catch (redirectError) {
      throw new Error(describeGoogleOAuthError(redirectError));
    }
  }

  const existingUser = workspaceAuth.currentUser;
  if (
    existingUser &&
    getWorkspaceGoogleEmail(existingUser)?.toLowerCase() === GOOGLE_WORKSPACE_EMAIL.toLowerCase()
  ) {
    // User-initiated recovery must show Google's consent screen so newly added
    // scopes (especially Forms responses read-only) are actually granted.
    try {
      const refreshed = await reauthenticateWithPopup(
        existingUser,
        buildWorkspaceProvider('consent')
      );
      return await finishWorkspaceSignIn(refreshed);
    } catch (silentRefreshError: any) {
      const code = silentRefreshError?.code ? String(silentRefreshError.code) : '';
      // If the existing session cannot be reauthorized, show account selection and consent.
      if (!code) throw new Error(describeGoogleOAuthError(silentRefreshError));
      if (
        code.includes('auth/user-mismatch') ||
        code.includes('auth/invalid-credential') ||
        code.includes('auth/unauthorized-domain') ||
        code.includes('auth/operation-not-allowed') ||
        code.includes('auth/web-storage-unsupported')
      ) {
        throw new Error(describeGoogleOAuthError(silentRefreshError));
      }
      // Other failures (missing SSO session, expired Google login, popup issue)
      // continue through one normal account-selection attempt below.
    }
  }

  const provider = buildWorkspaceProvider('select_account consent');
  try {
    const result = await signInWithPopup(workspaceAuth, provider);
    return await finishWorkspaceSignIn(result);
  } catch (error: any) {
    const code = error?.code ? String(error.code) : '';
    if (
      code.includes('auth/popup-blocked') ||
      code.includes('auth/operation-not-supported-in-this-environment')
    ) {
      try {
        await signInWithRedirect(workspaceAuth, provider);
        return null;
      } catch (redirectError) {
        throw new Error(describeGoogleOAuthError(redirectError));
      }
    }
    if (!code) throw error;
    throw new Error(describeGoogleOAuthError(error));
  }
};

/** Completes a Google redirect login after the browser returns to SIPANDU. */
export const completeGoogleRedirectSignIn = async (): Promise<{
  user: User;
  accessToken: string;
} | null> => {
  try {
    const result = await getRedirectResult(workspaceAuth);
    if (!result) return null;
    return await finishWorkspaceSignIn(result);
  } catch (error) {
    const { code } = getErrorParts(error);
    if (!code) throw error;
    throw new Error(describeGoogleOAuthError(error));
  }
};

/**
 * Automatically renew the short-lived Google API token using the already signed-in
 * Workspace identity and previously granted scopes. The OAuth prompt is set to
 * "none"; no account selection or consent screen is requested during refresh.
 * A single in-flight refresh is shared by polling and image requests.
 */
export const refreshWorkspaceAccessToken = async (force = false): Promise<string | null> => {
  if (isWorkspaceAuthorizationExpired()) {
    cacheWorkspaceToken(null);
    return null;
  }

  // Never start Firebase Web OAuth popups from a native Capacitor app.
  // On Android/iOS, reauthenticateWithPopup can escape the WebView and open
  // Firebase's browser Auth Handler (which may show "The requested action is invalid"),
  // especially while background sync is refreshing an expiring Google API token.
  // Native sign-in must be user-initiated through googleSignIn() / SocialLogin.
  if (Capacitor.isNativePlatform()) {
    if (!cachedAccessToken) cachedAccessToken = readStoredWorkspaceToken();
    const nativeTokenAge = cachedAccessToken ? Date.now() - cachedAccessTokenSavedAt : WORKSPACE_TOKEN_TTL_MS;
    if (cachedAccessToken && nativeTokenAge < WORKSPACE_TOKEN_TTL_MS) return cachedAccessToken;
    return null;
  }

  if (workspaceTokenRefreshInFlight) return workspaceTokenRefreshInFlight;

  const user = workspaceAuth.currentUser;
  if (!user) return null;
  const selectedEmail = getWorkspaceGoogleEmail(user);
  if (!selectedEmail || selectedEmail.toLowerCase() !== GOOGLE_WORKSPACE_EMAIL.toLowerCase()) {
    return null;
  }

  const now = Date.now();
  if (!force && now - lastWorkspaceAutoRefreshAttemptAt < WORKSPACE_TOKEN_REFRESH_RETRY_MS) {
    const age = cachedAccessToken ? now - cachedAccessTokenSavedAt : WORKSPACE_TOKEN_TTL_MS;
    return age < WORKSPACE_TOKEN_TTL_MS ? cachedAccessToken : null;
  }
  lastWorkspaceAutoRefreshAttemptAt = now;

  const operation = reauthenticateWithPopup(user, buildWorkspaceProvider('none'))
    .then(async (result) => {
      const refreshed = await finishWorkspaceSignIn(result, false);
      lastWorkspaceAutoRefreshAttemptAt = 0;
      return refreshed.accessToken;
    })
    .catch((error: unknown) => {
      // The current access token remains usable until its expiry even if a browser
      // blocks the silent popup; retry is throttled to avoid repeated popups.
      console.warn('SIPANDU automatic Google token refresh did not complete:', error);
      return null;
    })
    .finally(() => {
      workspaceTokenRefreshInFlight = null;
    });
  workspaceTokenRefreshInFlight = operation;
  return operation;
};

export const getAccessToken = async (): Promise<string | null> => {
  if (isWorkspaceAuthorizationExpired()) {
    cacheWorkspaceToken(null);
    return null;
  }
  if (!cachedAccessToken) cachedAccessToken = readStoredWorkspaceToken();
  const age = cachedAccessToken ? Date.now() - cachedAccessTokenSavedAt : WORKSPACE_TOKEN_TTL_MS;

  if (cachedAccessToken && age < WORKSPACE_TOKEN_REFRESH_AFTER_MS) {
    return cachedAccessToken;
  }

  // Refresh early while the current credential still works. If the browser blocks
  // the silent OAuth window, keep the old token until actual expiry.
  if (cachedAccessToken && age < WORKSPACE_TOKEN_TTL_MS) {
    const refreshed = await refreshWorkspaceAccessToken(false);
    return refreshed || cachedAccessToken;
  }

  if (cachedAccessToken) cacheWorkspaceToken(null);
  return await refreshWorkspaceAccessToken(false);
};

/** Clears an expired/rejected token without signing the Google user out of SIPANDU. */
export const invalidateAccessToken = (): void => {
  // Do not broadcast invalidation: image components would immediately re-fetch
  // and trigger a cascade of concurrent retries before the token is refreshed.
  cacheWorkspaceToken(null, false);
};

export const googleLogout = async () => {
  try {
    if (Capacitor.isNativePlatform()) {
      try { await SocialLogin.logout({ provider: 'google' }); } catch { /* Firebase session cleanup must still run */ }
    }
    await signOut(workspaceAuth);
  } finally {
    // Always remove the tab-scoped bearer token, even if signOut encounters an error.
    cacheWorkspaceToken(null);
  }
};

export const initAuthListener = (
  onAuthSuccess?: (user: User, token: string | null) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(workspaceAuth, async (user: User | null) => {
    if (user) {
      // Firebase may restore the Workspace identity after reload; restore its
      // still-valid, tab-scoped API token as well so UI state remains consistent.
      if (!cachedAccessToken) cachedAccessToken = readStoredWorkspaceToken();
      if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
    } else {
      cacheWorkspaceToken(null);
      if (onAuthFailure) onAuthFailure();
    }
  });
};

/**
 * Firestore rejects JavaScript `undefined` values, including optional nested
 * fields such as integratedForm/fotoKk/fotoRumah. Remove them recursively
 * before writing imported records; null, false, 0, and empty strings are kept.
 */
function stripUndefinedForFirestore(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.filter((item) => item !== undefined).map(stripUndefinedForFirestore);
  }
  if (value && typeof value === 'object') {
    if (value instanceof Date) return value;
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (nested !== undefined) output[key] = stripUndefinedForFirestore(nested);
    }
    return output;
  }
  return value;
}

/**
 * Firestore PPKS Sync Helpers
 */
export async function savePPKSToFirestore(ppks: PPKSRecord): Promise<true> {
  const user = auth.currentUser;
  if (!user) throw new Error('Belum masuk ke Firebase Auth sebagai akun SIPANDU.');

  // The primary session already refreshes its claims during app login; avoid forcing
  // a network refresh for every row in a batch sync.
  const token = await getIdTokenResult(user);
  const role = token.claims.role;
  if (role !== 'owner' && role !== 'supervisor') {
    if (role === 'pendamping') throw new Error('Firestore Rules hanya mengizinkan peran pendamping membaca data. Minta admin memberi peran owner/supervisor yang sesuai bila Anda memang berwenang menulis.');
    throw new Error('Custom claim role akun SIPANDU tidak valid. Admin harus menetapkan role tepercaya melalui Firebase Admin SDK.');
  }

  try {
    const firestoreRecord = stripUndefinedForFirestore(ppks) as PPKSRecord;
    await setDoc(doc(db, 'ppks', ppks.id), firestoreRecord, { merge: true });
    return true;
  } catch (error) {
    throw new Error(describeConnectionError(error));
  }
}

/**
 * Save only the independent Form Asesmen Terintegrasi answer map.
 * Pendamping may update this one field, but remains unable to create, delete,
 * or modify the spreadsheet-owned PPKS profile and other record fields.
 */
export async function getIntegratedAssessmentBackupMetadata(ppksId: string): Promise<{
  status: 'complete' | 'failed';
  error: string;
  fileId: string;
  webViewLink: string;
  savedAt: string;
} | null> {
  const user = auth.currentUser;
  if (!user) throw new Error('Belum masuk ke Firebase Auth.');
  const token = await getIdTokenResult(user);
  if (!VALID_ROLES.includes(token.claims.role as SipanduRole)) {
    throw new Error('Peran akun SIPANDU tidak valid untuk membaca status arsip asesmen.');
  }
  const snapshot = await getDoc(doc(db, 'integratedAssessmentBackups', ppksId));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  return {
    status: data.driveBackupStatus === 'complete' ? 'complete' : 'failed',
    error: String(data.driveBackupError || ''),
    fileId: String(data.driveFileId || ''),
    webViewLink: String(data.driveWebViewLink || ''),
    savedAt: data.savedAt && typeof data.savedAt.toDate === 'function'
      ? data.savedAt.toDate().toISOString() : '',
  };
}

export async function saveIntegratedAssessmentBackupMetadata(
  ppksId: string,
  backup: { status: 'complete' | 'failed'; fileId?: string; webViewLink?: string; error?: string },
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Belum masuk ke Firebase Auth sebagai akun SIPANDU.');
  if (!ppksId.trim()) throw new Error('ID PPKS kosong untuk metadata arsip Google Drive.');
  const token = await getIdTokenResult(user);
  const role = token.claims.role;
  if (!VALID_ROLES.includes(role as SipanduRole)) {
    throw new Error('Peran akun SIPANDU tidak valid untuk mencatat status arsip asesmen.');
  }
  const status = backup.status;
  const fileId = status === 'complete' ? String(backup.fileId || '') : '';
  const webViewLink = status === 'complete' ? String(backup.webViewLink || '') : '';
  if (status === 'complete' && (!fileId || !webViewLink)) {
    throw new Error('Google Drive belum mengembalikan ID dan tautan file untuk arsip asesmen.');
  }
  await setDoc(doc(db, 'integratedAssessmentBackups', ppksId), {
    ppksId,
    driveBackupStatus: status,
    driveBackupError: String(backup.error || '').slice(0, 1000),
    driveFileId: fileId,
    driveWebViewLink: webViewLink,
    savedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function saveIntegratedAssessmentToFirestore(
  ppksId: string,
  answers: Record<string, string | string[]>,
): Promise<{ role: SipanduRole }> {
  const user = auth.currentUser;
  if (!user) throw new Error('Belum masuk ke Firebase Auth sebagai akun SIPANDU.');
  const normalizedId = String(ppksId || '').trim();
  if (!normalizedId || normalizedId.includes('/') || normalizedId.length > 150) {
    throw new Error('ID PPKS kosong atau tidak valid. Pilih responden yang valid sebelum menyimpan.');
  }
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    throw new Error('Jawaban Form Asesmen Terintegrasi tidak valid.');
  }
  const unsupportedKeys = Object.keys(answers).filter((key) => !isIntegratedAssessmentAnswerKey(key));
  if (unsupportedKeys.length) {
    throw new Error(
      'Form Asesmen Terintegrasi berisi field yang tidak dikenal: ' +
      unsupportedKeys.slice(0, 5).join(', ') +
      '. Muat ulang formulir terbaru sebelum menyimpan.'
    );
  }
  if (Object.keys(answers).length > 96) {
    throw new Error('Jumlah field jawaban Form Asesmen Terintegrasi melebihi batas formulir resmi.');
  }

  const token = await getIdTokenResult(user, true);
  const role = token.claims.role;
  if (!VALID_ROLES.includes(role as SipanduRole)) {
    throw new Error('Custom claim role akun SIPANDU tidak valid. Admin harus menetapkan role tepercaya melalui Firebase Admin SDK.');
  }

  const cleanAnswers = stripUndefinedForFirestore(answers) as Record<string, string | string[]>;
  const answerReference = doc(db, 'integratedAssessmentAnswers', normalizedId);
  try {
    // The answer collection is canonical for the standalone assessment. It is
    // deliberately independent from /ppks so pendamping can save an assessment
    // even when an owner has not yet synchronized that respondent's roster doc.
    // It contains no identity/profile fields and cannot create a partial PPKS row.
    await setDoc(answerReference, {
      ppksId: normalizedId,
      formAsesmenTerintegrasi: cleanAnswers,
      updatedBy: user.uid,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    const canonicalError = error;
    const legacyPayload: Record<string, unknown> = {
      formAsesmenTerintegrasi: cleanAnswers,
    };
    if (role === 'owner' || role === 'supervisor') {
      legacyPayload.statusAsesmen = 'Terintegrasi';
    }
    try {
      // Compatibility fallback for deployments where the new answer-only rule
      // has not reached production yet. updateDoc never creates an incomplete
      // respondent profile.
      await updateDoc(doc(db, 'ppks', normalizedId), legacyPayload);
      return { role: role as SipanduRole };
    } catch (legacyError) {
      const legacyCode = getErrorParts(legacyError).code;
      if (legacyCode.includes('not-found')) {
        throw new Error(
          'Penyimpanan jawaban asesmen terpisah belum diizinkan oleh Firestore Rules. ' +
          'Aturan koleksi integratedAssessmentAnswers perlu dideploy terlebih dahulu. ' +
          describeConnectionError(canonicalError)
        );
      }
      throw new Error(describeConnectionError(canonicalError) + ' Jalur kompatibilitas lama juga gagal: ' + describeConnectionError(legacyError));
    }
  }

  // Keep legacy /ppks fields synchronized where a roster document exists, so
  // older app builds and existing archive readers remain compatible. A missing
  // roster document is expected and does not invalidate the canonical save above.
  const legacyPayload: Record<string, unknown> = {
    formAsesmenTerintegrasi: cleanAnswers,
  };
  if (role === 'owner' || role === 'supervisor') {
    legacyPayload.statusAsesmen = 'Terintegrasi';
  }
  try {
    await updateDoc(doc(db, 'ppks', normalizedId), legacyPayload);
  } catch (error) {
    console.warn(
      'SIPANDU: canonical integrated assessment answer saved; legacy PPKS mirror was not updated:',
      error,
    );
  }

  return { role: role as SipanduRole };
}

/**
 * Live answer-only collection for integrated assessments. It overlays answer maps
 * onto the Google Sheets roster in the app and never synthesizes respondent
 * profile documents when a roster row is not present locally.
 */
export function subscribeToIntegratedAssessmentAnswers(
  onAnswers: (
    answersById: Record<string, Record<string, string | string[]>>,
    info: { fromCache: boolean },
  ) => void,
  onError: (error: Error) => void,
): () => void {
  if (!auth.currentUser) {
    throw new Error('Sesi SIPANDU belum aktif untuk realtime jawaban asesmen.');
  }

  try {
    return onSnapshot(
      collection(db, 'integratedAssessmentAnswers'),
      (snapshot) => {
        const answersById: Record<string, Record<string, string | string[]>> = {};
        for (const item of snapshot.docs) {
          const data = item.data();
          if (data.ppksId !== item.id) continue;
          const answers = data.formAsesmenTerintegrasi;
          if (!answers || typeof answers !== 'object' || Array.isArray(answers)) continue;
          const safeAnswers = Object.fromEntries(
            Object.entries(answers as Record<string, unknown>).filter(([key, value]) =>
              isIntegratedAssessmentAnswerKey(key)
              && (typeof value === 'string'
                || (Array.isArray(value) && value.every((entry) => typeof entry === 'string')))
            ),
          ) as Record<string, string | string[]>;
          answersById[item.id] = safeAnswers;
        }
        onAnswers(answersById, { fromCache: snapshot.metadata.fromCache });
      },
      (error) => onError(new Error(describeConnectionError(error))),
    );
  } catch (error) {
    throw new Error(describeConnectionError(error));
  }
}

/**
 * Replace the legacy Firestore PPKS roster with the verified spreadsheet roster.
 * Spreadsheet fields are authoritative. Only separately stored assessment answers
 * and explicitly uploaded photo overrides are carried forward for the same person.
 * The separate stageOneIntake collection is intentionally untouched.
 */
/**
 * Idempotently synchronize the current respondent roster from the authoritative
 * spreadsheet into Firestore. Existing spreadsheet rows are matched by stable ID
 * first and by the conservative PPKS identity matcher second, so repeated imports
 * update the same document instead of creating duplicate contacts.
 *
 * Documents absent from the current sheet are deliberately retained. A missing row
 * can be a temporary import/permission issue; automatic sync must never erase a
 * respondent's profile or assessment history merely because a row was not returned.
 * Only positively identified legacy duplicate documents are consolidated.
 */
export async function syncPPKSCollectionFromSpreadsheet(
  records: PPKSRecord[],
  authoritativeProfileRecords: PPKSRecord[] = records,
): Promise<{ created: number; updated: number; duplicatesMerged: number }> {
  const user = auth.currentUser;
  if (!user) throw new Error('Belum masuk ke Firebase Auth sebagai akun SIPANDU.');
  const token = await getIdTokenResult(user);
  const role = token.claims.role;
  if (role !== 'owner' && role !== 'supervisor') {
    throw new Error('Penyimpanan roster spreadsheet ke Firestore hanya diizinkan untuk akun owner atau supervisor SIPANDU.');
  }
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('Penyimpanan Firestore dibatalkan: data spreadsheet kosong.');
  }

  const recordIds = records.map((record) => String(record.id || '').trim());
  if (recordIds.some((id) => !id) || new Set(recordIds).size !== recordIds.length) {
    throw new Error('Penyimpanan Firestore dibatalkan: ID PPKS kosong atau duplikat pada hasil impor.');
  }

  try {
    const snapshot = await getDocs(collection(db, 'ppks'));
    const oldDocs = snapshot.docs;
    const matchedOldIds = new Set<string>();
    const planned: Array<{
      id: string;
      data: PPKSRecord;
      matchedExistingIds: string[];
    }> = [];

    const mergeSupplemental = <T extends object>(
      current: T | undefined,
      previousValues: Array<T | undefined>,
    ): T | undefined => {
      const merged: Record<string, unknown> = {};
      for (const previous of previousValues) Object.assign(merged, previous || {});
      Object.assign(merged, current || {});
      const nonEmpty = Object.fromEntries(
        Object.entries(merged).filter(([, value]) =>
          value !== '' && value !== undefined && value !== null
        )
      );
      return Object.keys(nonEmpty).length ? nonEmpty as T : undefined;
    };

    for (const sourceRecord of records) {
      const authoritativeProfile = authoritativeProfileRecords.find((candidate) =>
        candidate.id === sourceRecord.id
      ) || authoritativeProfileRecords.find((candidate) =>
        samePPKSIdentity(candidate, sourceRecord)
      ) || sourceRecord;

      const exactDoc = oldDocs.find((candidate) =>
        candidate.id === sourceRecord.id && !matchedOldIds.has(candidate.id)
      );
      const identityMatches = oldDocs.filter((candidate) => {
        if (matchedOldIds.has(candidate.id)) return false;
        const previousRecord = { ...candidate.data(), id: candidate.id } as PPKSRecord;
        return samePPKSIdentity(previousRecord, sourceRecord);
      });
      const exactRecord = exactDoc
        ? ({ ...exactDoc.data(), id: exactDoc.id } as PPKSRecord)
        : null;

      // Prefer the exact source ID. Consolidate other documents only when the
      // exact document itself confirms the same identity; otherwise do not merge
      // another person into a reused source ID.
      const matchedDocs = exactDoc
        ? (samePPKSIdentity(exactRecord as PPKSRecord, sourceRecord)
          ? [exactDoc, ...identityMatches.filter((candidate) => candidate.id !== exactDoc.id)]
          : [exactDoc])
        : identityMatches;

      for (const candidate of matchedDocs) matchedOldIds.add(candidate.id);
      const previousRecords = matchedDocs.map((candidate) =>
        ({ ...candidate.data(), id: candidate.id } as PPKSRecord)
      );

      const manualPhotoOverrides = Object.assign(
        {},
        ...previousRecords.map((previous) => previous.manualPhotoOverrides || {}),
        sourceRecord.manualPhotoOverrides || {},
      );
      const normalizedOverrides = Object.fromEntries(
        Object.entries(manualPhotoOverrides).filter(([, value]) =>
          Boolean(normalizePPKSPhotoSource(value))
        )
      ) as NonNullable<PPKSRecord['manualPhotoOverrides']>;

      const migrated: PPKSRecord = {
        ...sourceRecord,
        // The selected spreadsheet tab remains authoritative for profile fields.
        timestamp: authoritativeProfile.timestamp,
        namaLengkap: authoritativeProfile.namaLengkap,
        nik: authoritativeProfile.nik,
        usia: authoritativeProfile.usia,
        jenisKelamin: authoritativeProfile.jenisKelamin,
        kotaDomisili: authoritativeProfile.kotaDomisili,
        lamaTerapiArv: authoritativeProfile.lamaTerapiArv,
        alamatLengkap: authoritativeProfile.alamatLengkap,
        noHpWa: authoritativeProfile.noHpWa,
        jenisBantuan: authoritativeProfile.jenisBantuan,
        intervensiMental: authoritativeProfile.intervensiMental,
        desil: authoritativeProfile.desil,
        // Preserve manually uploaded photos only as fallback when the source cell is empty.
        fotoDiri: normalizePPKSPhotoSource(normalizedOverrides.fotoDiri) || normalizePPKSPhotoSource(authoritativeProfile.fotoDiri) || '',
        fotoKtp: normalizePPKSPhotoSource(normalizedOverrides.fotoKtp) || normalizePPKSPhotoSource(authoritativeProfile.fotoKtp) || '',
        fotoKk: normalizePPKSPhotoSource(normalizedOverrides.fotoKk) || normalizePPKSPhotoSource(authoritativeProfile.fotoKk) || '',
        fotoRumah: normalizePPKSPhotoSource(normalizedOverrides.fotoRumah) || normalizePPKSPhotoSource(authoritativeProfile.fotoRumah) || '',
        manualPhotoOverrides: Object.keys(normalizedOverrides).length ? normalizedOverrides : undefined,
        integratedForm: mergeSupplemental(
          sourceRecord.integratedForm,
          previousRecords.map((previous) => previous.integratedForm),
        ),
        officialAssessment: mergeSupplemental(
          sourceRecord.officialAssessment,
          previousRecords.map((previous) => previous.officialAssessment),
        ),
        formAsesmenTerintegrasi: mergeSupplemental(
          sourceRecord.formAsesmenTerintegrasi,
          previousRecords.map((previous) => previous.formAsesmenTerintegrasi),
        ),
        statusAsesmen:
          sourceRecord.statusAsesmen === 'Tahap Awal'
            ? previousRecords.find((previous) =>
                previous.statusAsesmen && previous.statusAsesmen !== 'Tahap Awal'
              )?.statusAsesmen || sourceRecord.statusAsesmen
            : sourceRecord.statusAsesmen,
      };

      planned.push({
        id: sourceRecord.id,
        data: stripUndefinedForFirestore(migrated) as PPKSRecord,
        matchedExistingIds: matchedDocs.map((candidate) => candidate.id),
      });
    }

    const stableValue = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(stableValue);
      if (value && typeof value === 'object') {
        return Object.fromEntries(
          Object.entries(value as Record<string, unknown>)
            .filter(([, nested]) => nested !== undefined)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, nested]) => [key, stableValue(nested)])
        );
      }
      return value;
    };

    let created = 0;
    let updated = 0;
    const changedRecords = planned.filter((item) => {
      const current = oldDocs.find((candidate) => candidate.id === item.id);
      if (!current) {
        if (item.matchedExistingIds.length) updated += 1;
        else created += 1;
        return true;
      }
      const changed = JSON.stringify(stableValue(current.data())) !== JSON.stringify(stableValue(item.data));
      if (changed) updated += 1;
      return changed;
    });

    // Remove only old document IDs that were matched confidently to the same
    // respondent and migrated to the canonical spreadsheet ID. Unmatched records
    // are retained; spreadsheet omissions never trigger bulk deletion.
    const canonicalIds = new Set(planned.map((item) => item.id));
    const duplicateIds = [...new Set(planned.flatMap((item) =>
      item.matchedExistingIds.filter((id) => id !== item.id && !canonicalIds.has(id))
    ))];

    const operations: Array<
      | { kind: 'set'; id: string; data: PPKSRecord }
      | { kind: 'delete'; id: string }
    > = [
      ...changedRecords.map((item) => ({ kind: 'set' as const, id: item.id, data: item.data })),
      ...duplicateIds.map((id) => ({ kind: 'delete' as const, id })),
    ];

    // Firestore limits each write batch to 500 operations; use a margin.
    for (let offset = 0; offset < operations.length; offset += 400) {
      const batch = writeBatch(db);
      for (const operation of operations.slice(offset, offset + 400)) {
        const reference = doc(db, 'ppks', operation.id);
        if (operation.kind === 'set') batch.set(reference, operation.data);
        else batch.delete(reference);
      }
      await batch.commit();
    }

    return { created, updated, duplicatesMerged: duplicateIds.length };
  } catch (error) {
    throw new Error(describeConnectionError(error));
  }
}

export async function fetchPPKSFromFirestore(): Promise<PPKSRecord[]> {
  try {
    const snapshot = await getDocs(collection(db, 'ppks'));
    return snapshot.docs.map((document) => ({ id: document.id, ...document.data() }) as PPKSRecord);
  } catch (error) {
    throw new Error(describeConnectionError(error));
  }
}


function toStageOneIntakeFields(record: StageOneIntakePayload | PPKSRecord) {
  return {
    timestamp: String(record.timestamp || ''),
    namaLengkap: String(record.namaLengkap || '').trim(),
    nik: String(record.nik || '').replace(/\D/g, ''),
    usia: Number(record.usia),
    jenisKelamin: record.jenisKelamin,
    kotaDomisili: String(record.kotaDomisili || '').trim(),
    alamatLengkap: String(record.alamatLengkap || ''),
    noHpWa: String(record.noHpWa || '').trim(),
    jenisBantuan: String(record.jenisBantuan || ''),
    intervensiMental: String(record.intervensiMental || ''),
    desil: Number(record.desil || 0),
    fotoDiri: String(record.fotoDiri || ''),
    fotoKtp: String(record.fotoKtp || ''),
    statusAsesmen: 'Tahap Awal' as const,
  };
}

/** Public, write-only intake used by the separate respondent-facing SIPANDU form. */
export async function submitPublicStageOneIntake(
  payload: StageOneIntakePayload,
  turnstileToken: string,
): Promise<string> {
  const normalized = toStageOneIntakeFields(payload);
  if (!normalized.namaLengkap || !/^\d{16}$/.test(normalized.nik)) {
    throw new Error('Nama lengkap dan NIK 16 digit wajib diisi dengan benar.');
  }
  if (!Number.isInteger(normalized.usia) || normalized.usia < 1 || normalized.usia > 100) {
    throw new Error('Usia responden harus berupa angka 1–100 tahun.');
  }
  if (!turnstileToken || turnstileToken.length > 2048) {
    throw new Error('Selesaikan verifikasi keamanan sebelum mengirim formulir.');
  }
  const response = await fetch('https://sipandu-registration.aryprayoga139.workers.dev/public-stage-one-intake', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: normalized, turnstileToken }),
  }).catch(() => {
    throw new Error('Layanan verifikasi SIPANDU tidak dapat dijangkau. Periksa koneksi internet lalu coba kembali.');
  });
  const result = await response.json().catch(() => ({})) as { ok?: boolean; id?: string; message?: string };
  if (!response.ok || !result.ok || !result.id) {
    throw new Error(result.message || 'Verifikasi keamanan atau penyimpanan asesmen tahap awal belum berhasil.');
  }
  return result.id;
}

/** Staff-entered stage-one forms are saved to the same dedicated intake feed. */
export async function saveStageOneIntakeToFirestore(record: PPKSRecord): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Belum masuk ke Firebase Auth sebagai petugas SIPANDU.');
  const token = await getIdTokenResult(user);
  const role = token.claims.role;
  if (role !== 'owner' && role !== 'supervisor') {
    throw new Error('Penyimpanan asesmen tahap awal ke cloud memerlukan peran owner atau supervisor.');
  }
  try {
    await setDoc(doc(db, 'stageOneIntake', record.id), {
      ...toStageOneIntakeFields(record),
      source: 'staff-entry',
      submittedAt: serverTimestamp(),
    }, { merge: true });
  } catch (error) {
    throw new Error('Gagal menyimpan asesmen tahap awal: ' + describeConnectionError(error));
  }
}

/** Read the dedicated native-SIPANDU intake feed; clients without staff auth cannot read it. */
export function subscribeToStageOneIntake(
  onRecords: (records: PPKSRecord[]) => void,
  onError: (error: Error) => void,
): () => void {
  if (!auth.currentUser) throw new Error('Sesi SIPANDU belum aktif untuk membaca database asesmen tahap awal.');
  return onSnapshot(
    collection(db, 'stageOneIntake'),
    (snapshot) => {
      const records = snapshot.docs
        .map((document) => ({ ...document.data(), id: document.id }) as PPKSRecord)
        .filter((record) => record.statusAsesmen === 'Tahap Awal' && !isLegacySamplePPKS(record))
        .sort((left, right) => (Date.parse(String(right.timestamp || '')) || 0) - (Date.parse(String(left.timestamp || '')) || 0));
      onRecords(records);
    },
    (error) => onError(new Error(describeConnectionError(error))),
  );
}

/**
 * Subscribe to cross-device PPKS changes in real time. Firestore's listener is
 * intentionally read-only; it never writes data or propagates deletions.
 * Callers must reconnect after onError because Firestore ends a failed listener.
 */
export function subscribeToPPKSChanges(
  onRecords: (records: PPKSRecord[], info: { fromCache: boolean }) => void,
  onError: (error: Error) => void,
): () => void {
  if (!auth.currentUser) {
    throw new Error('Sesi SIPANDU belum aktif untuk realtime Firestore.');
  }

  try {
    return onSnapshot(
      collection(db, 'ppks'),
      (snapshot) => {
        const records = snapshot.docs
          .map((document) => ({ ...document.data(), id: document.id }) as PPKSRecord)
          .filter((record) => record && !isLegacySamplePPKS(record));
        onRecords(records, { fromCache: snapshot.metadata.fromCache });
      },
      (error) => onError(new Error(describeConnectionError(error))),
    );
  } catch (error) {
    // Fail synchronously so the caller can schedule reconnection after connect()
    // finishes assigning its unsubscribe function (avoids a dead retry loop).
    throw new Error(describeConnectionError(error));
  }
}

/**
 * Physically deletes only the retired sample/test PPKS documents from Firestore.
 * Requires a trusted owner/supervisor role. Real respondent documents are left intact.
 */
export async function removeLegacyDemoPPKSFromFirestore(): Promise<number> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sesi SIPANDU belum aktif; masuk kembali sebelum membersihkan data contoh Firestore.');

  const token = await getIdTokenResult(user);
  const role = token.claims.role;
  if (role !== 'owner' && role !== 'supervisor') {
    throw new Error('Pembersihan data contoh Firestore memerlukan peran owner atau supervisor.');
  }

  const snapshot = await getDocs(collection(db, 'ppks'));
  let deletedCount = 0;
  for (const item of snapshot.docs) {
    const data = item.data() as Partial<PPKSRecord>;
    const candidateName = String(data.namaLengkap || '');
    // Check both the stored record ID and the actual Firestore document ID.
    // Older demo documents may have mismatched or missing data.id fields.
    const isDemo =
      isLegacySamplePPKS({ id: item.id, namaLengkap: candidateName }) ||
      isLegacySamplePPKS({ id: String(data.id || ''), namaLengkap: candidateName });
    if (!isDemo) continue;
    await deleteDoc(doc(db, 'ppks', item.id));
    deletedCount++;
  }
  return deletedCount;
}


/**
 * Reconcile the Firestore PPKS collection with the verified Google Sheets roster.
 * The current roster is expected to have 46 unique real respondents. A mismatched
 * or partial import is rejected before any write/delete so a wrong tab cannot
 * accidentally erase the database.
 *
 * All canonical documents are written first, merging non-empty stored details
 * (photos, assessments and interventions) into the matching source record. Only
 * after all canonical writes succeed are old documents outside the 44-item roster
 * deleted. Access is restricted to the trusted owner/supervisor Firebase role.
 */
export async function reconcilePPKSFirestoreWithSpreadsheet(sourceRecords: PPKSRecord[]): Promise<number> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sesi SIPANDU belum aktif; masuk kembali sebelum menyelaraskan database PPKS.');

  const token = await getIdTokenResult(user);
  const role = token.claims.role;
  if (role !== 'owner' && role !== 'supervisor') {
    throw new Error('Penyelarasan database Firestore dengan spreadsheet memerlukan peran owner atau supervisor.');
  }

  const uniqueSource = deduplicatePPKSRecords(sourceRecords);
  // The source tab may contain repeated Google Forms submissions. Validate the
  // deduplicated roster count, not the raw row count: 47 rows that resolve to
  // the 46 verified people are a valid cleanup input, not a reason to abort.
  if (uniqueSource.length !== EXPECTED_REAL_PPKS_COUNT) {
    throw new Error(
      'Pembersihan Firestore dibatalkan demi keamanan: roster spreadsheet yang terbaca berisi ' +
      sourceRecords.length + ' baris mentah dan ' + uniqueSource.length +
      ' PPKS unik, sedangkan jumlah terverifikasi saat ini ' +
      EXPECTED_REAL_PPKS_COUNT +
      '. Tidak ada dokumen Firestore yang dihapus. Pastikan tab dan impor spreadsheet benar sebelum menyelaraskan database.'
    );
  }
  if (uniqueSource.some((record) => !String(record.id || '').trim() || String(record.id).includes('/'))) {
    throw new Error('Pembersihan Firestore dibatalkan: ada ID PPKS kosong atau tidak valid pada hasil impor spreadsheet.');
  }
  const sourceIds = uniqueSource.map((record) => record.id);
  if (new Set(sourceIds).size !== sourceIds.length) {
    throw new Error('Pembersihan Firestore dibatalkan: ID PPKS pada spreadsheet tidak unik.');
  }

  const snapshot = await getDocs(collection(db, 'ppks'));
  const documents = snapshot.docs.map((item) => {
    const data = item.data() as Partial<PPKSRecord>;
    return {
      documentId: item.id,
      record: { ...data, id: String(data.id || item.id) } as PPKSRecord,
    };
  });

  const normalizedName = (value: unknown) => String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('id-ID')
    .replace(/[^a-z0-9]/g, '');
  const normalizedPhone = (value: unknown) => String(value ?? '').replace(/\D/g, '');
  const validNIK = (record: PPKSRecord) => {
    const candidate = String(record.officialAssessment?.q23 || record.nik || '').replace(/\D/g, '');
    return /^\d{16}$/.test(candidate) ? candidate : '';
  };
  const sourceNameCounts = new Map<string, number>();
  for (const record of uniqueSource) {
    const name = normalizedName(record.namaLengkap);
    if (name) sourceNameCounts.set(name, (sourceNameCounts.get(name) || 0) + 1);
  }

  const isMatchingRosterPerson = (stored: typeof documents[number], source: PPKSRecord): boolean => {
    const storedNik = validNIK(stored.record);
    const sourceNik = validNIK(source);
    const storedName = normalizedName(stored.record.namaLengkap);
    const sourceName = normalizedName(source.namaLengkap);
    // A duplicated/mistyped NIK with conflicting full names must not merge or
    // delete two distinct respondent records.
    if (storedNik && sourceNik) {
      if (storedNik !== sourceNik) return false;
      return !storedName || !sourceName || storedName === sourceName;
    }
    if (stored.documentId === source.id) {
      // A matching path is useful only if the visible names do not conflict.
      return !storedName || !sourceName || storedName === sourceName;
    }
    if (!storedName || storedName !== sourceName) return false;
    const storedPhone = normalizedPhone(stored.record.noHpWa);
    const sourcePhone = normalizedPhone(source.noHpWa);
    if (storedPhone && sourcePhone) return storedPhone === sourcePhone;

    // Name-only fallback is allowed only when this name occurs once in the
    // verified source roster. Ambiguous repeated names are not cross-matched.
    return sourceNameCounts.get(sourceName) === 1;
  };

  const hasValue = (value: unknown): boolean => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim() !== '';
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
    return true;
  };
  const mergeObject = (
    previous: Record<string, unknown> | undefined,
    next: Record<string, unknown> | undefined
  ): Record<string, unknown> | undefined => {
    const result: Record<string, unknown> = { ...(previous || {}) };
    for (const [key, value] of Object.entries(next || {})) {
      if (hasValue(value)) result[key] = value;
    }
    return Object.keys(result).length ? result : undefined;
  };
  const mergeSourceWithStored = (source: PPKSRecord, storedRecords: PPKSRecord[]): PPKSRecord => {
    const orderedStored = [...storedRecords].sort((a, b) => {
      const aTime = parsePPKSTimestamp(a.timestamp);
      const bTime = parsePPKSTimestamp(b.timestamp);
      if (aTime === null && bTime === null) return 0;
      if (aTime === null) return -1;
      if (bTime === null) return 1;
      return aTime - bTime;
    });

    const preserved: Record<string, unknown> = {};
    for (const stored of orderedStored) {
      for (const [key, value] of Object.entries(stored)) {
        if (key === 'id' || key === 'timestamp' || key === 'officialAssessment' || key === 'integratedForm') continue;
        if (hasValue(value)) preserved[key] = value;
      }
      preserved.officialAssessment = mergeObject(
        preserved.officialAssessment as Record<string, unknown> | undefined,
        stored.officialAssessment as Record<string, unknown> | undefined
      );
      preserved.integratedForm = mergeObject(
        preserved.integratedForm as Record<string, unknown> | undefined,
        stored.integratedForm as Record<string, unknown> | undefined
      );
    }

    const merged: Record<string, unknown> = { ...preserved };
    for (const [key, value] of Object.entries(source)) {
      const hasUsefulSourceValue = (key === 'usia' || key === 'desil')
        ? Number(value) > 0
        : hasValue(value);
      if (hasUsefulSourceValue) merged[key] = value;
      else if (!(key in merged)) merged[key] = value;
    }

    merged.id = source.id;
    // Keep only actual image URLs/data; old cache values sometimes held a bare
    // Drive filename, which looked non-empty but could never be rendered.
    merged.fotoDiri = normalizePPKSPhotoSource(source.fotoDiri) ||
      normalizePPKSPhotoSource(preserved.fotoDiri) || '';
    merged.fotoKtp = normalizePPKSPhotoSource(source.fotoKtp) ||
      normalizePPKSPhotoSource(preserved.fotoKtp) || '';
    merged.fotoKk = normalizePPKSPhotoSource(source.fotoKk) ||
      normalizePPKSPhotoSource(preserved.fotoKk) || '';
    merged.fotoRumah = normalizePPKSPhotoSource(source.fotoRumah) ||
      normalizePPKSPhotoSource(preserved.fotoRumah) || '';
    // Timestamp stays exactly as formatted in Google Sheets, even if an older
    // stored record had a different timestamp representation.
    merged.timestamp = source.timestamp;
    merged.officialAssessment = mergeObject(
      preserved.officialAssessment as Record<string, unknown> | undefined,
      source.officialAssessment as Record<string, unknown> | undefined
    );
    merged.integratedForm = mergeObject(
      preserved.integratedForm as Record<string, unknown> | undefined,
      source.integratedForm as Record<string, unknown> | undefined
    );
    if (hasValue(merged.officialAssessment) || hasValue(merged.integratedForm)) {
      merged.statusAsesmen = 'Terintegrasi';
    }
    return stripUndefinedForFirestore(merged) as PPKSRecord;
  };

  const assignedDocumentIds = new Set<string>();
  const canonicalRecords: PPKSRecord[] = [];
  for (const source of uniqueSource) {
    const pathCollision = documents.find((item) => item.documentId === source.id);
    if (pathCollision && !isMatchingRosterPerson(pathCollision, source)) {
      throw new Error(
        'Pembersihan Firestore dibatalkan: ID ' + source.id +
        ' sudah dipakai dokumen dengan identitas berbeda. Tidak ada dokumen yang dihapus.'
      );
    }
    const matches = documents.filter((item) =>
      !assignedDocumentIds.has(item.documentId) && isMatchingRosterPerson(item, source)
    );
    matches.forEach((item) => assignedDocumentIds.add(item.documentId));
    canonicalRecords.push(mergeSourceWithStored(source, matches.map((item) => item.record)));
  }

  // Never delete existing documents until all 44 canonical records can be written.
  const upsertBatch = writeBatch(db);
  for (const record of canonicalRecords) {
    upsertBatch.set(doc(db, 'ppks', record.id), stripUndefinedForFirestore(record) as PPKSRecord);
  }
  await upsertBatch.commit();

  const canonicalIds = new Set(canonicalRecords.map((record) => record.id));
  const obsoleteDocumentIds = documents
    .map((item) => item.documentId)
    .filter((documentId) => !canonicalIds.has(documentId));
  // Firestore batches accept at most 500 writes; use a conservative 400 per batch.
  for (let offset = 0; offset < obsoleteDocumentIds.length; offset += 400) {
    const deleteBatch = writeBatch(db);
    for (const documentId of obsoleteDocumentIds.slice(offset, offset + 400)) {
      deleteBatch.delete(doc(db, 'ppks', documentId));
    }
    await deleteBatch.commit();
  }

  return obsoleteDocumentIds.length;
}


// SIPANDU member profile is stored per Firebase UID so it follows the user across devices.
// Role claims are intentionally excluded from this document and can only be issued server-side.
export async function createSIPANDUUserProfile(uid: string, email: string, profile: ProfileUser): Promise<void> {
  const targetUid = uid.trim();
  const requestedEmail = email.trim();
  const user = auth.currentUser;
  if (!targetUid || !requestedEmail || !user || user.uid !== targetUid) {
    throw new Error('Identitas atau sesi akun SIPANDU tidak cocok untuk membuat profil.');
  }
  const token = await getIdTokenResult(user, true);
  const authenticatedEmail = String(token.claims.email || user.email || '').trim();
  if (!authenticatedEmail || authenticatedEmail.toLowerCase() !== requestedEmail.toLowerCase()) {
    throw new Error('Email pendaftaran tidak cocok dengan identitas Firebase yang sedang masuk.');
  }
  try {
    await setDoc(doc(db, 'userProfiles', targetUid), {
      nama: profile.nama.trim(),
      nip: profile.nip.trim(),
      jabatan: profile.jabatan.trim(),
      unitKerja: profile.unitKerja.trim(),
      noHp: profile.noHp.trim(),
      photoUrl: profile.photoUrl || '',
      // Use the exact email claim from Firebase Authentication. Firestore Rules
      // compare this field to request.auth.token.email, which may preserve casing.
      email: authenticatedEmail,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    const { code } = getErrorParts(error);
    if (code.includes('permission-denied')) {
      throw new Error(
        `Firestore menolak pembuatan profil. Pastikan firestore.rules sudah diterbitkan ke database "${firebaseConfig.firestoreDatabaseId}" pada proyek "${firebaseConfig.projectId}".`
      );
    }
    throw error;
  }
}

export async function getSIPANDUUserProfile(uid: string): Promise<ProfileUser | null> {
  if (!uid.trim()) return null;
  const snapshot = await getDoc(doc(db, 'userProfiles', uid));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  return {
    nama: String(data.nama || ''),
    nip: String(data.nip || ''),
    jabatan: String(data.jabatan || ''),
    unitKerja: String(data.unitKerja || ''),
    noHp: String(data.noHp || ''),
    photoUrl: String(data.photoUrl || ''),
  };
}

export async function saveSIPANDUUserProfile(uid: string, profile: ProfileUser): Promise<void> {
  const user = auth.currentUser;
  const targetUid = uid.trim();
  if (!targetUid || !user || user.uid !== targetUid) {
    throw new Error('Sesi akun SIPANDU tidak cocok dengan profil yang akan disimpan. Masuk kembali, lalu ulangi.');
  }
  // Refresh the token before a write so a changed Firebase email claim is not
  // compared against stale profile metadata or an expired cached ID token.
  const token = await getIdTokenResult(user, true);
  const email = String(token.claims.email || user.email || '').trim();
  if (!email) throw new Error('Email akun Firebase tidak tersedia. Profil belum dapat disimpan dengan aman.');

  const profileRef = doc(db, 'userProfiles', targetUid);
  const profileFields = {
    nama: profile.nama.trim(),
    nip: profile.nip.trim(),
    jabatan: profile.jabatan.trim(),
    unitKerja: profile.unitKerja.trim(),
    noHp: String(profile.noHp || '').trim(),
    photoUrl: String(profile.photoUrl || ''),
  };

  try {
    const existingProfile = await getDoc(profileRef);
    if (existingProfile.exists()) {
      const existingData = existingProfile.data();
      const existingEmail = String(existingData.email || '').trim();
      if (existingEmail && existingEmail.toLowerCase() !== email.toLowerCase()) {
        throw new Error('Email pada profil cloud berbeda dengan email akun Firebase. Hubungi administrator untuk memeriksa identitas akun.');
      }

      // Repair legacy profile metadata safely: email can only be updated to
      // the authenticated token email; createdAt is backfilled only if absent.
      const updates = {
        ...profileFields,
        email,
        updatedAt: serverTimestamp(),
        ...(!existingData.createdAt ? { createdAt: serverTimestamp() } : {}),
      };
      await updateDoc(profileRef, updates);
      return;
    }

    // First-time creation must satisfy all required fields in firestore.rules.
    await setDoc(profileRef, {
      ...profileFields,
      email,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (error instanceof Error && /Email pada profil cloud berbeda/.test(error.message)) throw error;
    const { code } = getErrorParts(error);
    if (code.includes('permission-denied')) {
      throw new Error(
        `Firestore menolak penyimpanan profil. Periksa apakah firestore.rules terbaru sudah diterbitkan ke database "${firebaseConfig.firestoreDatabaseId}" pada proyek "${firebaseConfig.projectId}". Jangan ubah Rules menjadi publik.`
      );
    }
    throw error;
  }
}


const serviceDateIsValid = (value: string): boolean =>
  value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value);

const toISODate = (value: any): string => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return '';
};

/** Read only the active roster's compact service-status records in bounded batches. */
export function subscribeToPPKSServiceStatus(
  ppksIds: string[],
  role: string,
  userUid: string,
  onStatuses: (statuses: PPKSServiceStatus[], info: { fromCache: boolean }) => void,
  onError: (error: Error) => void,
): () => void {
  if (!auth.currentUser) throw new Error('Sesi SIPANDU belum aktif untuk membaca status layanan.');
  const ids = [...new Set(ppksIds.map((id) => String(id || '').trim()).filter((id) => id && !id.includes('/')))];
  if (!ids.length) {
    onStatuses([], { fromCache: false });
    return () => undefined;
  }

  const statusById = new Map<string, PPKSServiceStatus>();
  const unsubscribers: Array<() => void> = [];
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += 30) chunks.push(ids.slice(index, index + 30));
  const cacheFlags = new Array(chunks.length).fill(false);

  try {
    const statusCollection = collection(db, 'ppksServiceStatus');
    const queries = role === 'pendamping'
      ? [query(statusCollection, where('assignedToUid', '==', userUid))]
      : chunks.map((chunk) => query(statusCollection, where('ppksId', 'in', chunk)));
    queries.forEach((statusQuery, queryIndex) => {
      const unsubscribe = onSnapshot(
        statusQuery,
        (snapshot) => {
          cacheFlags[queryIndex] = snapshot.metadata.fromCache;
          const allowedIds = new Set(ids);
          if (role !== 'pendamping') {
            const queryIds = new Set(chunks[queryIndex] || []);
            for (const [id] of statusById) {
              if (queryIds.has(id)) statusById.delete(id);
            }
          } else {
            statusById.clear();
          }
          for (const document of snapshot.docs) {
            if (!allowedIds.has(document.id)) continue;
            const data = document.data();
            statusById.set(document.id, {
              ...data,
              ppksId: document.id,
              lastNutritionAt: toISODate(data.lastNutritionAt),
              lastEntrepreneurshipAt: toISODate(data.lastEntrepreneurshipAt),
              lastTherapyAt: toISODate(data.lastTherapyAt),
              followUpAt: toISODate(data.followUpAt),
              createdAt: toISODate(data.createdAt),
              updatedAt: toISODate(data.updatedAt),
            } as PPKSServiceStatus);
          }
          onStatuses([...statusById.values()], { fromCache: cacheFlags.some(Boolean) });
        },
        (error) => onError(new Error(describeConnectionError(error))),
      );
      unsubscribers.push(unsubscribe);
    });
  } catch (error) {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
    throw new Error(describeConnectionError(error));
  }

  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}

/** Save one status change and its immutable audit event in the same transaction. */
export async function savePPKSServiceUpdate(input: PPKSServiceUpdateInput): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sesi SIPANDU berakhir. Masuk kembali sebelum memperbarui layanan.');
  if (!input.ppksId.trim() || input.ppksId.includes('/')) throw new Error('ID PPKS tidak valid.');
  if (!serviceDateIsValid(input.serviceDate) || !serviceDateIsValid(input.followUpAt)) {
    throw new Error('Tanggal layanan atau tindak lanjut tidak valid.');
  }
  const token = await getIdTokenResult(user);
  if (!['owner', 'supervisor', 'pendamping'].includes(String(token.claims.role || ''))) {
    throw new Error('Peran akun tidak memiliki akses ke modul layanan PPKS.');
  }

  const assistanceStatuses = ['belum-diverifikasi', 'dibutuhkan', 'dalam-proses', 'diterima', 'tidak-dibutuhkan'];
  const therapyStatuses = ['belum-dimulai', 'terjadwal', 'aktif', 'selesai'];
  const validStatus = input.eventType === 'psychosocial-therapy'
    ? therapyStatuses.includes(input.status)
    : assistanceStatuses.includes(input.status);
  if (!validStatus) throw new Error('Status layanan tidak sesuai dengan jenis layanan yang dipilih.');
  if ((input.status === 'diterima' || input.status === 'selesai') && !input.serviceDate) {
    throw new Error('Tanggal wajib dicatat untuk bantuan yang diterima atau terapi yang selesai.');
  }
  const reasons = [
    '', 'konfirmasi-penerimaan-bantuan', 'penjadwalan-penyaluran',
    'monitoring-pendampingan', 'evaluasi-terapi', 'verifikasi-dokumen', 'lainnya',
  ];
  if (!reasons.includes(input.followUpReason) || (!!input.followUpAt !== !!input.followUpReason)) {
    throw new Error('Alasan tindak lanjut harus dipilih saat tanggal tindak lanjut diisi.');
  }

  const statusRef = doc(db, 'ppksServiceStatus', input.ppksId);
  const eventRef = doc(collection(db, 'ppksServiceEvents'));
  try {
    await runTransaction(db, async (transaction) => {
      const existingSnapshot = await transaction.get(statusRef);
      const existing = existingSnapshot.exists()
        ? existingSnapshot.data() as Partial<PPKSServiceStatus>
        : input.initialStatus;
      if (token.claims.role === 'pendamping' &&
          (!existingSnapshot.exists() || existing.assignedToUid !== user.uid)) {
        throw new Error('Pendamping hanya dapat memperbarui layanan PPKS yang sudah ditugaskan kepadanya.');
      }
      const next: Record<string, unknown> = {
        ppksId: input.ppksId,
        nutritionStatus: existing.nutritionStatus || input.initialStatus.nutritionStatus,
        entrepreneurshipStatus: existing.entrepreneurshipStatus || input.initialStatus.entrepreneurshipStatus,
        psychosocialStatus: existing.psychosocialStatus || input.initialStatus.psychosocialStatus,
        lastNutritionAt: existing.lastNutritionAt || '',
        lastEntrepreneurshipAt: existing.lastEntrepreneurshipAt || '',
        lastTherapyAt: existing.lastTherapyAt || '',
        therapySessionCount: Number(existing.therapySessionCount || 0),
        followUpAt: input.followUpAt,
        followUpReason: input.followUpReason,
        assignedToUid: String(existing.assignedToUid || user.uid),
        createdAt: existingSnapshot.exists() ? existing.createdAt : serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedByUid: user.uid,
      };

      if (input.eventType === 'nutrition-assistance') {
        next.nutritionStatus = input.status;
        if (input.status === 'diterima' && input.serviceDate) next.lastNutritionAt = input.serviceDate;
      } else if (input.eventType === 'entrepreneurship-assistance') {
        next.entrepreneurshipStatus = input.status;
        if (input.status === 'diterima' && input.serviceDate) next.lastEntrepreneurshipAt = input.serviceDate;
      } else {
        next.psychosocialStatus = input.status;
        if (input.status === 'selesai' && input.serviceDate) {
          next.lastTherapyAt = input.serviceDate;
          next.therapySessionCount = Number(next.therapySessionCount || 0) + 1;
        }
      }

      transaction.set(statusRef, next, { merge: true });
      transaction.set(eventRef, {
        id: eventRef.id,
        ppksId: input.ppksId,
        eventType: input.eventType,
        status: input.status,
        serviceDate: input.serviceDate,
        followUpAt: input.followUpAt,
        followUpReason: input.followUpReason,
        createdByUid: user.uid,
        assignedToUid: String(next.assignedToUid || user.uid),
        createdAt: serverTimestamp(),
      });
    });
  } catch (error) {
    throw new Error(describeConnectionError(error));
  }
}

/**
 * Read a bounded, privacy-minimized audit feed for owner/supervisor accounts.
 * Rules independently enforce the role boundary on both source collections.
 */
export async function fetchSecurityAuditActivity(): Promise<SecurityAuditEntry[]> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sesi SIPANDU belum aktif.');
  const role = String((await getIdTokenResult(user, true)).claims.role || '');
  if (role !== 'owner' && role !== 'supervisor') {
    throw new Error('Pusat Audit hanya tersedia untuk owner dan supervisor.');
  }

  try {
    const [serviceSnapshot, visitSnapshot] = await Promise.all([
      getDocs(query(collection(db, 'ppksServiceEvents'), orderBy('createdAt', 'desc'), limit(250))),
      getDocs(query(collection(db, 'fieldVisits'), orderBy('createdAt', 'desc'), limit(250))),
    ]);
    const serviceEvents = serviceSnapshot.docs.map((item) => {
      const data = item.data();
      return {
        id: item.id,
        ppksId: String(data.ppksId || ''),
        eventType: String(data.eventType || ''),
        status: String(data.status || ''),
        serviceDate: String(data.serviceDate || ''),
        createdByUid: String(data.createdByUid || ''),
        assignedToUid: String(data.assignedToUid || ''),
        createdAt: toISODate(data.createdAt),
      };
    });
    const fieldVisits = visitSnapshot.docs.map((item) => {
      const data = item.data();
      return {
        id: item.id,
        ppksId: String(data.ppksId || ''),
        visitType: String(data.visitType || ''),
        outcome: String(data.outcome || ''),
        visitDate: String(data.visitDate || ''),
        createdByUid: String(data.createdByUid || ''),
        assignedToUid: String(data.assignedToUid || ''),
        createdAt: toISODate(data.createdAt),
      };
    });
    const { createSecurityAuditEntries } = await import('./securityAudit');
    return createSecurityAuditEntries(
      serviceEvents as Parameters<typeof createSecurityAuditEntries>[0],
      fieldVisits as Parameters<typeof createSecurityAuditEntries>[1],
    );
  } catch (error) {
    throw new Error(describeConnectionError(error));
  }
}

/** Read the structured, append-only history for a single PPKS. */
export async function fetchPPKSServiceEvents(ppksId: string): Promise<PPKSServiceEvent[]> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sesi SIPANDU belum aktif.');
  if (!ppksId.trim() || ppksId.includes('/')) throw new Error('ID PPKS tidak valid.');
  try {
    const role = (await getIdTokenResult(user)).claims.role;
    const eventQuery = role === 'pendamping'
      ? query(collection(db, 'ppksServiceEvents'), where('assignedToUid', '==', user.uid))
      : query(collection(db, 'ppksServiceEvents'), where('ppksId', '==', ppksId));
    const snapshot = await getDocs(eventQuery);
    return snapshot.docs
      .filter((document) => document.data().ppksId === ppksId)
      .map((document) => {
      const data = document.data();
      return {
        ...data,
        id: document.id,
        createdAt: toISODate(data.createdAt),
      } as PPKSServiceEvent;
    }).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  } catch (error) {
    throw new Error(describeConnectionError(error));
  }
}


const isValidFieldVisitDate = (value: string): boolean =>
  value === '' || /^\\d{4}-\\d{2}-\\d{2}$/.test(value);

/** Live field visit feed; pendamping can only query records assigned to their UID. */
export function subscribeToFieldVisits(
  role: string,
  userUid: string,
  onVisits: (visits: FieldVisitRecord[]) => void,
  onError: (error: Error) => void,
): () => void {
  if (!auth.currentUser) throw new Error('Sesi SIPANDU belum aktif.');
  if (!['owner', 'supervisor', 'pendamping'].includes(role)) {
    throw new Error('Peran akun tidak memiliki akses ke Pendampingan Lapangan.');
  }
  const visitsQuery = role === 'pendamping'
    ? query(collection(db, 'fieldVisits'), where('assignedToUid', '==', userUid))
    : query(collection(db, 'fieldVisits'), limit(500));
  return onSnapshot(visitsQuery, (snapshot) => {
    const visits = snapshot.docs.map((item) => {
      const data = item.data();
      return {
        ...data,
        id: item.id,
        createdAt: toISODate(data.createdAt),
      } as FieldVisitRecord;
    }).sort((left, right) => right.visitDate.localeCompare(left.visitDate) || right.createdAt.localeCompare(left.createdAt));
    onVisits(visits);
  }, (error) => onError(new Error(describeConnectionError(error))));
}

/** Create an immutable, auditable field visit; records cannot be edited or deleted. */
export async function createFieldVisit(input: Omit<FieldVisitRecord, 'id' | 'createdByUid' | 'createdAt'>): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sesi SIPANDU berakhir. Masuk kembali sebelum mencatat kunjungan.');
  const token = await getIdTokenResult(user, true);
  const role = String(token.claims.role || '');
  if (!['owner', 'supervisor', 'pendamping'].includes(role)) throw new Error('Peran akun tidak memiliki akses.');
  if (!input.ppksId.trim() || input.ppksId.includes('/') || input.ppksId.length > 150) throw new Error('ID PPKS tidak valid.');
  if (!isValidFieldVisitDate(input.visitDate) || !input.visitDate) throw new Error('Tanggal kunjungan wajib diisi.');
  if (!isValidFieldVisitDate(input.followUpAt)) throw new Error('Tanggal tindak lanjut tidak valid.');
  const types = ['kunjungan-rumah', 'kunjungan-faskes', 'pendampingan-sosial', 'monitoring-bantuan', 'koordinasi-rujukan'];
  const outcomes = ['selesai', 'perlu-tindak-lanjut', 'tidak-bertemu', 'dijadwalkan-ulang'];
  if (!types.includes(input.visitType) || !outcomes.includes(input.outcome)) throw new Error('Jenis atau hasil kunjungan tidak valid.');
  if (input.summary.trim().length < 3 || input.summary.length > 3000 || input.nextAction.length > 1200) throw new Error('Ringkasan atau tindak lanjut tidak valid.');
  if (input.followUpAt && !input.nextAction.trim()) throw new Error('Tindak lanjut wajib dijelaskan jika tanggal ditetapkan.');
  const assignedToUid = role === 'pendamping' ? user.uid : String(input.assignedToUid || user.uid).trim();
  if (!assignedToUid || assignedToUid.length > 128) throw new Error('UID pendamping yang ditugaskan tidak valid.');
  try {
    const visitRef = doc(collection(db, 'fieldVisits'));
    await setDoc(visitRef, {
      id: visitRef.id,
      ppksId: input.ppksId,
      visitDate: input.visitDate,
      visitType: input.visitType,
      outcome: input.outcome,
      summary: input.summary.trim(),
      nextAction: input.nextAction.trim(),
      followUpAt: input.followUpAt,
      assignedToUid,
      createdByUid: user.uid,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    throw new Error(describeConnectionError(error));
  }
}
