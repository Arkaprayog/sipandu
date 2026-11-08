import { getIdTokenResult } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  deleteObject,
  getDownloadURL,
  getBlob,
  getStorage,
  ref,
  uploadBytesResumable,
  type UploadTaskSnapshot,
} from 'firebase/storage';
import { auth, db } from './firebase';
import { backupDocumentToCentralDrive, deleteCentralDriveFile } from './googleDriveBackup';

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
  driveBackupStatus: 'pending' | 'complete' | 'failed';
  driveBackupError: string;
  driveFileId: string;
  driveWebViewLink: string;
  driveBackupAt: string;
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
      driveBackupStatus: 'pending',
      driveBackupError: '',
      driveFileId: '',
      driveWebViewLink: '',
      driveBackupAt: null,
      driveBackupUpdatedAt: serverTimestamp(),
    });

    onProgress?.(100);
    let driveBackupStatus: StaffDocumentRecord['driveBackupStatus'] = 'failed';
    let driveBackupError = '';
    let driveFileId = '';
    let driveWebViewLink = '';
    let driveBackupAt = '';
    try {
      const driveCopy = await backupDocumentToCentralDrive(file, category);
      driveFileId = driveCopy.id;
      driveWebViewLink = driveCopy.webViewLink || '';
      driveBackupAt = new Date().toISOString();
      try {
        await updateDoc(recordRef, {
          driveBackupStatus: 'complete',
          driveBackupError: '',
          driveFileId,
          driveWebViewLink,
          driveBackupAt: serverTimestamp(),
          driveBackupUpdatedAt: serverTimestamp(),
        });
        driveBackupStatus = 'complete';
      } catch (metadataError) {
        try { await deleteCentralDriveFile(driveFileId); } catch { /* avoid masking metadata failure */ }
        driveFileId = '';
        driveWebViewLink = '';
        driveBackupError = 'File Firebase tersimpan, tetapi status backup Drive gagal dicatat: ' +
          (metadataError instanceof Error ? metadataError.message : String(metadataError));
      }
    } catch (driveError) {
      driveBackupError = driveError instanceof Error ? driveError.message : 'Salinan Google Drive gagal dibuat.';
    }

    if (driveBackupStatus !== 'complete') {
      try {
        await updateDoc(recordRef, {
          driveBackupStatus: 'failed',
          driveBackupError: driveBackupError.slice(0, 1000),
          driveFileId: '',
          driveWebViewLink: '',
          driveBackupAt: null,
          driveBackupUpdatedAt: serverTimestamp(),
        });
      } catch (statusError) {
        driveBackupError += ' Status backup belum dapat dicatat di Firestore: ' +
          (statusError instanceof Error ? statusError.message : String(statusError));
      }
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
      driveBackupStatus,
      driveBackupError,
      driveFileId,
      driveWebViewLink,
      driveBackupAt,
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
        driveBackupStatus: data.driveBackupStatus === 'complete' ? 'complete' : 'failed',
        driveBackupError: String(data.driveBackupError || (
          data.driveBackupStatus === 'pending'
            ? 'Backup Google Drive masih menunggu. Pilih ulang file asli untuk mengulang.'
            : 'Arsip lama belum memiliki status backup Google Drive. Pilih ulang file asli untuk membuat salinan.'
        )),
        driveFileId: String(data.driveFileId || ''),
        driveWebViewLink: String(data.driveWebViewLink || ''),
        driveBackupAt: data.driveBackupAt && typeof data.driveBackupAt.toDate === 'function'
          ? data.driveBackupAt.toDate().toISOString() : '',
      };
    });
  } catch (error) {
    throw explainDocumentError(error);
  }
}

export async function retryStaffDocumentDriveBackup(
  documentId: string,
  file: File,
): Promise<StaffDocumentRecord> {
  const user = await getVerifiedStaff();
  const recordRef = doc(db, 'staffDocuments', documentId);
  const snapshot = await getDoc(recordRef);
  if (!snapshot.exists()) throw new Error('Metadata dokumen tidak ditemukan di Firestore.');
  const data = snapshot.data();
  const roleToken = await getIdTokenResult(user);
  const role = roleToken.claims.role;
  if (data.ownerUid !== user.uid && role !== 'owner' && role !== 'supervisor') {
    throw new Error('Anda hanya dapat mengulang backup dokumen yang Anda unggah sendiri.');
  }
  if (file.name !== String(data.name || '') || file.size !== Number(data.size || 0)) {
    throw new Error('File yang dipilih tidak sama dengan file arsip. Pilih file asli dengan nama dan ukuran yang sama.');
  }

  try {
    const backup = await backupDocumentToCentralDrive(
      file,
      data.category === 'surat-lainnya' ? 'surat-lainnya' : 'surat-tugas',
    );
    try {
      await updateDoc(recordRef, {
        driveBackupStatus: 'complete',
        driveBackupError: '',
        driveFileId: backup.id,
        driveWebViewLink: backup.webViewLink || '',
        driveBackupAt: serverTimestamp(),
        driveBackupUpdatedAt: serverTimestamp(),
      });
    } catch (error) {
      try { await deleteCentralDriveFile(backup.id); } catch { /* preserve Firestore error */ }
      throw error;
    }
    return {
      id: documentId,
      name: String(data.name || file.name),
      contentType: String(data.contentType || file.type || 'application/octet-stream'),
      size: Number(data.size || file.size),
      storagePath: String(data.storagePath || ''),
      downloadUrl: String(data.downloadUrl || ''),
      ownerUid: String(data.ownerUid || ''),
      ownerEmail: String(data.ownerEmail || ''),
      category: data.category === 'surat-lainnya' ? 'surat-lainnya' : 'surat-tugas',
      uploadedAt: data.uploadedAt && typeof data.uploadedAt.toDate === 'function'
        ? data.uploadedAt.toDate().toISOString() : '',
      driveBackupStatus: 'complete',
      driveBackupError: '',
      driveFileId: backup.id,
      driveWebViewLink: backup.webViewLink || '',
      driveBackupAt: new Date().toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await updateDoc(recordRef, {
        driveBackupStatus: 'failed',
        driveBackupError: message.slice(0, 1000),
        driveFileId: '',
        driveWebViewLink: '',
        driveBackupAt: null,
        driveBackupUpdatedAt: serverTimestamp(),
      });
    } catch (statusError) {
      console.error('SIPANDU could not persist failed Drive retry status:', statusError);
    }
    throw new Error(message);
  }
}

export async function deleteStaffDocument(documentId: string, storagePath: string): Promise<void> {
  await getVerifiedStaff();
  try {
    const recordRef = doc(db, 'staffDocuments', documentId);
    const existing = await getDoc(recordRef);
    if (existing.exists()) {
      const driveFileId = String(existing.data().driveFileId || '');
      // Remove the backup first. If Google Drive cannot confirm deletion, keep
      // the Firebase copy and archive record intact instead of creating orphans.
      if (driveFileId) await deleteCentralDriveFile(driveFileId);
    }
    if (storagePath) {
      try {
        await deleteObject(ref(storage, storagePath));
      } catch (error) {
        const code = (error as { code?: string })?.code;
        if (code !== 'storage/object-not-found') throw error;
      }
    }
    await deleteDoc(recordRef);
  } catch (error) {
    throw explainDocumentError(error);
  }
}

/** Downloads through Firebase Storage Rules; does not expose a bearer download URL. */
export async function downloadStaffDocument(storagePath: string): Promise<Blob> {
  await getVerifiedStaff();
  if (!storagePath.startsWith('staff-documents/')) throw new Error('Lokasi dokumen tidak valid.');
  try { return await getBlob(ref(storage, storagePath)); }
  catch (error) { throw explainDocumentError(error); }
}
