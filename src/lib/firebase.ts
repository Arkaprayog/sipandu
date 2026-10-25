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

// Short-lived Workspace OAuth token stays memory-only. It must be re-authorized
// after refresh/expiry; never persist it in localStorage.
let cachedAccessToken: string | null = null;

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
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    const code = error?.code ? String(error.code) : '';
    if (code.includes('auth/unauthorized-domain')) {
      throw new Error('Domain aplikasi belum diizinkan pada Firebase Authentication → Settings → Authorized domains.');
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

export const getAccessToken = async (): Promise<string | null> => cachedAccessToken;

export const googleLogout = async () => {
  await signOut(workspaceAuth);
  cachedAccessToken = null;
};

export const initAuthListener = (
  onAuthSuccess?: (user: User, token: string | null) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(workspaceAuth, async (user: User | null) => {
    if (user) {
      if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
    } else {
      cachedAccessToken = null;
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
