import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDocFromServer,
  collection,
  getDocs,
  setDoc,
  onSnapshot,
} from 'firebase/firestore';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { PPKSRecord } from '../types';

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore with custom databaseId if provided
export const db = firebaseConfig.firestoreDatabaseId
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

// Initialize Auth
export const auth = getAuth(app);

// Configure Google Auth Provider with Workspace scopes
export const googleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.addScope('https://www.googleapis.com/auth/drive');
googleAuthProvider.addScope('https://www.googleapis.com/auth/drive.file');
googleAuthProvider.addScope('https://www.googleapis.com/auth/spreadsheets');
googleAuthProvider.addScope('https://www.googleapis.com/auth/forms.body');
googleAuthProvider.addScope('https://www.googleapis.com/auth/forms.responses.readonly');

// In-memory token cache (never stored in localStorage)
let cachedAccessToken: string | null = null;
let isSigningIn = false;

export type ConnectionCheckResult = {
  service: 'Firebase Auth' | 'Firestore';
  ok: boolean;
  message: string;
  checkedAt: string;
};

function describeConnectionError(error: unknown): string {
  const e = error as { code?: string; message?: string };
  const code = e?.code ? String(e.code) : 'unknown';
  const message = e?.message || (error instanceof Error ? error.message : String(error));
  if (code.includes('permission-denied')) return 'Akses Firestore ditolak. Periksa Firestore Security Rules dan akun yang masuk.';
  if (code.includes('unavailable') || /offline|network/i.test(message)) return 'Layanan tidak tersedia atau koneksi jaringan bermasalah.';
  if (code.includes('unauthenticated')) return 'Sesi Firebase tidak terautentikasi. Masuk kembali ke aplikasi.';
  return `Kode: ${code}. ${message}`;
}

/** Performs an explicit server-side read and returns visible diagnostic details. */
export async function testFirestoreConnection(): Promise<ConnectionCheckResult> {
  const checkedAt = new Date().toISOString();
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return { service: 'Firestore', ok: true, message: 'Server Firestore merespons. Dokumen pemeriksaan dapat dibaca.', checkedAt };
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
    return { service: 'Firebase Auth', ok: true, message: auth.currentUser
      ? `Firebase Auth siap; sesi aktif untuk ${auth.currentUser.email || 'akun tanpa email'}.`
      : 'Firebase Auth SDK siap, tetapi belum ada pengguna yang masuk.', checkedAt };
  } catch (error) {
    return { service: 'Firebase Auth', ok: false, message: error instanceof Error ? error.message : String(error), checkedAt };
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
    isSigningIn = true;
    const result = await signInWithPopup(auth, googleAuthProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Google Auth');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Google Sign-in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const googleLogout = async () => {
  await signOut(auth);
  cachedAccessToken = null;
};

export const initAuthListener = (
  onAuthSuccess?: (user: User, token: string | null) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
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
export async function savePPKSToFirestore(ppks: PPKSRecord) {
  try {
    const docRef = doc(db, 'ppks', ppks.id);
    await setDoc(docRef, ppks, { merge: true });
    return true;
  } catch (err) {
    console.warn('Firestore sync note:', err);
    return false;
  }
}

export async function fetchPPKSFromFirestore(): Promise<PPKSRecord[]> {
  try {
    const querySnapshot = await getDocs(collection(db, 'ppks'));
    const list: PPKSRecord[] = [];
    querySnapshot.forEach((docSnap) => {
      list.push(docSnap.data() as PPKSRecord);
    });
    return list;
  } catch (err) {
    console.warn('Firestore fetch note:', err);
    return [];
  }
}
