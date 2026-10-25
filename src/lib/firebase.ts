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
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
  getIdTokenResult,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { PPKSRecord } from '../types';

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
googleAuthProvider.addScope('https://www.googleapis.com/auth/drive');
googleAuthProvider.addScope('https://www.googleapis.com/auth/drive.file');
googleAuthProvider.addScope('https://www.googleapis.com/auth/spreadsheets');
googleAuthProvider.addScope('https://www.googleapis.com/auth/forms.body');
googleAuthProvider.addScope('https://www.googleapis.com/auth/forms.responses.readonly');

// Google access tokens are short-lived. Keep them only in sessionStorage (not
// localStorage) so a page reload in the same tab does not force an immediate
// reconnect, and discard them conservatively before Google's usual 1-hour expiry.
const WORKSPACE_TOKEN_STORAGE_KEY = 'sipandu_google_workspace_token_v1';
const WORKSPACE_TOKEN_TTL_MS = 50 * 60 * 1000;
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
      return;
    }
    window.sessionStorage.setItem(
      WORKSPACE_TOKEN_STORAGE_KEY,
      JSON.stringify({ token, savedAt: Date.now() })
    );
  } catch {
    // Keep the current-page session working even when browser storage is blocked.
  }
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
 * Sign in with Google to obtain Workspace access token
 */
export const googleSignIn = async (): Promise<{
  user: User;
  accessToken: string;
} | null> => {
  try {
    const result = await signInWithPopup(workspaceAuth, googleAuthProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Google berhasil merespons tetapi tidak memberikan access token untuk Drive/Sheets/Forms. Periksa consent screen, scope OAuth, dan API yang diaktifkan.');
    }
    cacheWorkspaceToken(credential.accessToken);
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    const code = error?.code ? String(error.code) : '';
    if (code.includes('auth/unauthorized-domain')) {
      const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
      const projectId = auth.app.options.projectId || 'gen-lang-client-0197631978';
      const projectSettingsUrl = `https://console.firebase.google.com/project/${projectId}/authentication/settings`;
      const domainToAdd = hostname || '(hostname aplikasi belum terdeteksi)';
      throw new Error(
        `Domain aplikasi "${domainToAdd}" belum diizinkan pada Firebase Authentication.\n\n` +
        `PERBAIKAN ADMIN FIREBASE:\n` +
        `1. Buka ${projectSettingsUrl}\n` +
        `2. Cari "Authorized domains", lalu pilih "Add domain".\n` +
        `3. Tambahkan hanya hostname: ${domainToAdd} (tanpa https://, tanpa path, dan tanpa port).\n` +
        `4. Simpan perubahan, muat ulang SIPANDU, lalu ulangi otorisasi Google.\n\n` +
        `Untuk URL GitHub Pages https://arkaprayog.github.io/sipandu/, domain yang benar adalah arkaprayog.github.io — bukan arkaprayog.github.io/sipandu.\n` +
        `Proyek Firebase yang digunakan aplikasi ini: ${projectId}.`
      );
    }
    if (code.includes('auth/popup-blocked')) {
      throw new Error('Popup Google diblokir browser. Izinkan pop-up untuk situs SIPANDU, lalu tekan Pulihkan Izin Google API.');
    }
    if (code.includes('auth/popup-closed-by-user')) {
      throw new Error('Jendela otorisasi Google ditutup sebelum selesai.');
    }
    console.error('Google Workspace authorization failed:', error);
    throw error;
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
  await signOut(workspaceAuth);
  cacheWorkspaceToken(null);
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
