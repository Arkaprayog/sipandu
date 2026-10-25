import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  doc,
  collection,
  getDocs,
  setDoc,
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
import { GOOGLE_WORKSPACE_EMAIL } from './googleSIPANDUResources';

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
let cachedAccessTokenSavedAt = 0;

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

function cacheWorkspaceToken(token: string | null): void {
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
  window.dispatchEvent(new Event('sipandu-workspace-token-updated'));
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

export const getAccessToken = async (): Promise<string | null> => {
  if (cachedAccessToken && Date.now() - cachedAccessTokenSavedAt >= WORKSPACE_TOKEN_TTL_MS) {
    cacheWorkspaceToken(null);
  }
  if (!cachedAccessToken) cachedAccessToken = readStoredWorkspaceToken();
  return cachedAccessToken;
};

/** Clears an expired/rejected token without signing the Google user out of SIPANDU. */
export const invalidateAccessToken = (): void => {
  cacheWorkspaceToken(null);
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
    await setDoc(doc(db, 'ppks', ppks.id), ppks, { merge: true });
    return true;
  } catch (error) {
    throw new Error(describeConnectionError(error));
  }
}

export async function fetchPPKSFromFirestore(): Promise<PPKSRecord[]> {
  try {
    const snapshot = await getDocs(collection(db, 'ppks'));
    return snapshot.docs.map((document) => document.data() as PPKSRecord);
  } catch (error) {
    throw new Error(describeConnectionError(error));
  }
}
