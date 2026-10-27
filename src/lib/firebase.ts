import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  doc,
  collection,
  getDocs,
  onSnapshot,
  setDoc,
  deleteDoc,
  writeBatch,
  query,
  limit,
} from 'firebase/firestore';
import {
  getAuth,
  browserLocalPersistence,
  setPersistence,
  signInWithPopup,
  reauthenticateWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
  getIdTokenResult,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { PPKSRecord } from '../types';
import { deduplicatePPKSRecords, EXPECTED_REAL_PPKS_COUNT, parsePPKSTimestamp } from './ppksData';
import { isLegacySamplePPKS } from '../data/initialData';
import { GOOGLE_WORKSPACE_EMAIL } from './googleSIPANDUResources';
import { normalizePPKSPhotoSource } from './photoSources';

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

export const auth = getAuth(app);
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
googleAuthProvider.addScope('https://www.googleapis.com/auth/drive');
googleAuthProvider.addScope('https://www.googleapis.com/auth/drive.file');
googleAuthProvider.addScope('https://www.googleapis.com/auth/spreadsheets');
googleAuthProvider.addScope('https://www.googleapis.com/auth/forms.body');
googleAuthProvider.addScope('https://www.googleapis.com/auth/forms.responses.readonly');

// Google access tokens are short-lived. Keep them only in sessionStorage (not
// localStorage) so a page reload in the same tab does not force an immediate
// reconnect, and discard them conservatively before Google's usual 1-hour expiry.
const WORKSPACE_TOKEN_STORAGE_KEY = 'sipandu_google_workspace_token_v1';
const WORKSPACE_TOKEN_TTL_MS = 55 * 60 * 1000;
// Proactively renew before expiry so the two-minute live-sync and private photos
// usually continue without a manual "Pulihkan Izin" click.
const WORKSPACE_TOKEN_REFRESH_AFTER_MS = 42 * 60 * 1000;
const WORKSPACE_TOKEN_REFRESH_RETRY_MS = 5 * 60 * 1000;
let cachedAccessTokenSavedAt = 0;
let lastWorkspaceAutoRefreshAttemptAt = 0;
let workspaceTokenRefreshInFlight: Promise<string | null> | null = null;

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
  if (notify) window.dispatchEvent(new Event('sipandu-workspace-token-updated'));
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
async function finishWorkspaceSignIn(result: import('firebase/auth').UserCredential): Promise<{
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
  cacheWorkspaceToken(credential.accessToken);
  return { user: result.user, accessToken: credential.accessToken };
}

function describeGoogleOAuthError(error: unknown): string {
  const { code, message } = getErrorParts(error);
  if (code.includes('auth/unauthorized-domain')) {
    const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
    const projectId = auth.app.options.projectId || 'gen-lang-client-0197631978';
    return `Domain aplikasi "${hostname || '(tidak terdeteksi)'}" belum diizinkan pada Firebase Authentication. Admin harus membuka https://console.firebase.google.com/project/${projectId}/authentication/settings, lalu menambahkan hostname aplikasi pada Authorized domains (tanpa https:// atau path). Untuk GitHub Pages, tambahkan arkaprayog.github.io; untuk Vercel, tambahkan sipandu-sigma.vercel.app. Setelah itu ulangi login.`;
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
function buildWorkspaceProvider(prompt?: 'none' | 'select_account'): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({
    login_hint: GOOGLE_WORKSPACE_EMAIL,
    ...(prompt ? { prompt } : {}),
  });
  provider.addScope('email');
  provider.addScope('profile');
  provider.addScope('https://www.googleapis.com/auth/drive');
  provider.addScope('https://www.googleapis.com/auth/drive.file');
  provider.addScope('https://www.googleapis.com/auth/spreadsheets');
  provider.addScope('https://www.googleapis.com/auth/forms.body');
  provider.addScope('https://www.googleapis.com/auth/forms.responses.readonly');
  return provider;
}

export const googleSignIn = async (): Promise<{
  user: User;
  accessToken: string;
} | null> => {
  // Keep the Workspace identity across reloads; the short-lived Google API
  // access token is still held only in sessionStorage for security.
  await setPersistence(workspaceAuth, browserLocalPersistence);

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
    const provider = buildWorkspaceProvider('select_account');
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
    // First try to renew access with the already-authorized Google session,
    // without forcing account selection or repeating the consent screen.
    try {
      const refreshed = await reauthenticateWithPopup(
        existingUser,
        buildWorkspaceProvider('none')
      );
      return await finishWorkspaceSignIn(refreshed);
    } catch (silentRefreshError: any) {
      const code = silentRefreshError?.code ? String(silentRefreshError.code) : '';
      // Fall back to normal account selection, which no longer forces consent.
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

  const provider = buildWorkspaceProvider('select_account');
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
      const refreshed = await finishWorkspaceSignIn(result);
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

export async function fetchPPKSFromFirestore(): Promise<PPKSRecord[]> {
  try {
    const snapshot = await getDocs(collection(db, 'ppks'));
    return snapshot.docs.map((document) => ({ id: document.id, ...document.data() }) as PPKSRecord);
  } catch (error) {
    throw new Error(describeConnectionError(error));
  }
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
 * The current roster is expected to have 44 unique real respondents. A mismatched
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
  // deduplicated roster count, not the raw row count: 45 rows that resolve to
  // the 44 verified people are a valid cleanup input, not a reason to abort.
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
    // Conflicting verified NIKs are never treated as one person, even if a path
    // or name happens to be equal.
    if (storedNik && sourceNik) return storedNik === sourceNik;

    const storedName = normalizedName(stored.record.namaLengkap);
    const sourceName = normalizedName(source.namaLengkap);
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
