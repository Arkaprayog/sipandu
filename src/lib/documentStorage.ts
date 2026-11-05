import { getIdTokenResult } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import {
  deleteObject,
  getDownloadURL,
  getStorage,
  ref,
  uploadBytesResumable,
  type UploadTaskSnapshot,
} from 'firebase/storage';
import { auth, db } from './firebase';
import { backupDocumentToCentralDrive } from './googleDriveBackup';

export type StaffDocumentCategory = 'surat-tugas' | 'surat-lainnya';

export interface StaffDocumentRecord {
  id: string;
  name: string;
  contentType: string;
  size: number;
  storagePath: string;
  downloadUrl: string;
  ownerUid: string;
  ownerEmail: string;
  category: StaffDocumentCategory;
  uploadedAt: string;
  driveBackupError?: string;
}

const MAX_DOCUMENT_SIZE = 25 * 1024 * 1024;
const storage = getStorage(auth.app);

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  heic: 'image/heic',
  heif: 'image/heif',
};

export const ACCEPTED_DOCUMENT_EXTENSIONS = Object.keys(MIME_BY_EXTENSION)
  .map((extension) => `.${extension}`)
  .join(',');

function getSafeFileName(name: string): string {
  const cleaned = name
    .normalize('NFKC')
    .replace(/[\\/\\?%*:|"<>]/g, '_')
    .replace(/[\\u0000-\\u001f]/g, '')
    .trim()
    .slice(0, 120);
  return cleaned || 'dokumen';
}

function getDocumentMimeType(file: File): string {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  const mimeType = MIME_BY_EXTENSION[extension];
  if (!mimeType) {
    throw new Error('Format file tidak didukung. Gunakan PDF, DOC/DOCX, JPG/PNG, GIF, WEBP, BMP, TIFF, HEIC, atau HEIF.');
  }
  return mimeType;
}

async function getVerifiedStaff() {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Sesi SIPANDU tidak ditemukan. Masuk kembali, lalu ulangi upload.');
  }

  const token = await getIdTokenResult(user);
  const role = token.claims.role;
  if (role !== 'owner' && role !== 'supervisor' && role !== 'pendamping') {
    throw new Error('Akun ini belum memiliki peran SIPANDU yang sah untuk mengelola dokumen.');
  }
  return user;
}

function explainDocumentError(error: unknown): Error {
  const candidate = error as { code?: unknown; message?: unknown };
  const code = typeof candidate?.code === 'string' ? candidate.code : '';
  const message = typeof candidate?.message === 'string'
    ? candidate.message
    : error instanceof Error ? error.message : String(error);

  if (code === 'storage/unauthorized' || code === 'permission-denied') {
    return new Error('Firebase menolak penyimpanan dokumen. Periksa dan terapkan Firebase Storage Rules serta Firestore Rules SIPANDU.');
  }
  if (code === 'storage/bucket-not-found' || code === 'storage/no-default-bucket') {
    return new Error('Firebase Storage belum diaktifkan atau bucket belum dibuat pada proyek SIPANDU. Aktifkan Storage di Firebase Console terlebih dahulu.');
  }
  if (code === 'storage/canceled') {
    return new Error('Upload dibatalkan sebelum file selesai disimpan.');
  }
  if (code === 'storage/retry-limit-exceeded' || code === 'storage/unknown' || code === 'unavailable') {
    return new Error('Koneksi ke penyimpanan Firebase terputus. Periksa jaringan lalu ulangi upload. File yang belum selesai tidak dicatat sebagai dokumen tersimpan.');
  }
  return new Error(message || 'Dokumen gagal disimpan.');
}

export async function uploadStaffDocument(
  file: File,
  category: StaffDocumentCategory,
  onProgress?: (percent: number) => void,
): Promise<StaffDocumentRecord> {
  if (!file) throw new Error('Pilih file terlebih dahulu.');
  if (file.size <= 0) throw new Error('File kosong tidak dapat diunggah.');
  if (file.size > MAX_DOCUMENT_SIZE) {
    throw new Error('Ukuran file melebihi batas 25 MB. Kompres atau pilih file yang lebih kecil.');
  }

  const user = await getVerifiedStaff();
  const contentType = getDocumentMimeType(file);
  const documentId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `doc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const safeName = getSafeFileName(file.name);
  const storagePath = `staff-documents/${user.uid}/${documentId}/${safeName}`;
  const fileRef = ref(storage, storagePath);
  const task = uploadBytesResumable(fileRef, file, {
    contentType,
    customMetadata: { ownerUid: user.uid, documentId },
  });
  let uploadCompleted = false;

  try {
    const snapshot: UploadTaskSnapshot = await new Promise((resolve, reject) => {
      task.on(
        'state_changed',
        (state) => {
          const percent = state.totalBytes > 0
            ? Math.round((state.bytesTransferred / state.totalBytes) * 100)
            : 0;
          onProgress?.(Math.min(100, Math.max(0, percent)));
        },
        reject,
        () => resolve(task.snapshot),
      );
    });
    uploadCompleted = true;

    const downloadUrl = await getDownloadURL(snapshot.ref);
    const recordRef = doc(db, 'staffDocuments', documentId);
    await setDoc(recordRef, {
      name: file.name.slice(0, 255),
      contentType,
      size: file.size,
      storagePath,
      downloadUrl,
      ownerUid: user.uid,
      ownerEmail: user.email || '',
      category,
      uploadedAt: serverTimestamp(),
    });

    onProgress?.(100);
    let driveBackupError: string | undefined;
    try {
      await backupDocumentToCentralDrive(file, category);
    } catch (driveError) {
      driveBackupError = driveError instanceof Error ? driveError.message : 'Salinan Google Drive gagal dibuat.';
    }

    return {
      id: documentId,
      name: file.name,
      contentType,
      size: file.size,
      storagePath,
      downloadUrl,
      ownerUid: user.uid,
      ownerEmail: user.email || '',
      category,
      uploadedAt: new Date().toISOString(),
      ...(driveBackupError ? { driveBackupError } : {}),
    };
  } catch (error) {
    if (uploadCompleted) {
      try { await deleteObject(fileRef); } catch { /* prevent orphan cleanup from masking the original error */ }
    }
    throw explainDocumentError(error);
  }
}

export async function listStaffDocuments(): Promise<StaffDocumentRecord[]> {
  await getVerifiedStaff();
  try {
    const snapshot = await getDocs(query(
      collection(db, 'staffDocuments'),
      orderBy('uploadedAt', 'desc'),
      limit(100),
    ));
    return snapshot.docs.map((item) => {
      const data = item.data();
      const uploadedAt = data.uploadedAt && typeof data.uploadedAt.toDate === 'function'
        ? data.uploadedAt.toDate().toISOString()
        : '';
      return {
        id: item.id,
        name: String(data.name || 'Dokumen'),
        contentType: String(data.contentType || 'application/octet-stream'),
        size: Number(data.size || 0),
        storagePath: String(data.storagePath || ''),
        downloadUrl: String(data.downloadUrl || ''),
        ownerUid: String(data.ownerUid || ''),
        ownerEmail: String(data.ownerEmail || ''),
        category: data.category === 'surat-lainnya' ? 'surat-lainnya' : 'surat-tugas',
        uploadedAt,
      };
    });
  } catch (error) {
    throw explainDocumentError(error);
  }
}

export async function deleteStaffDocument(documentId: string, storagePath: string): Promise<void> {
  await getVerifiedStaff();
  try {
    if (storagePath) {
      try {
        await deleteObject(ref(storage, storagePath));
      } catch (error) {
        const code = (error as { code?: string })?.code;
        if (code !== 'storage/object-not-found') throw error;
      }
    }
    await deleteDoc(doc(db, 'staffDocuments', documentId));
  } catch (error) {
    throw explainDocumentError(error);
  }
}
