import { getIdTokenResult } from 'firebase/auth';
import {
  collection, deleteDoc, deleteField, doc, getDoc, getDocs, limit, orderBy, query,
  serverTimestamp, setDoc, updateDoc,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import {
  uploadStaffDocumentViaArchiveWorker,
  downloadStaffDocumentViaArchiveWorker,
  deleteStaffDocumentViaArchiveWorker,
} from './googleDriveBackup';

export type StaffDocumentCategory = 'surat-tugas' | 'surat-lainnya';

export interface StaffDocumentRecord {
  id: string;
  name: string;
  contentType: string;
  size: number;
  ownerUid: string;
  ownerEmail: string;
  category: StaffDocumentCategory;
  uploadedAt: string;
  driveBackupStatus: 'complete' | 'failed';
  driveBackupError: string;
  driveFileId: string;
  driveBackupAt: string;
}

const MAX_DOCUMENT_SIZE = 25 * 1024 * 1024;
const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff',
  heic: 'image/heic', heif: 'image/heif',
};

export const ACCEPTED_DOCUMENT_EXTENSIONS = Object.keys(MIME_BY_EXTENSION)
  .map((extension) => '.' + extension)
  .join(',');

async function getVerifiedStaff() {
  const user = auth.currentUser;
  if (!user) throw new Error('Sesi SIPANDU tidak ditemukan. Masuk kembali, lalu ulangi operasi.');
  const token = await getIdTokenResult(user);
  const role = token.claims.role;
  if (role !== 'owner' && role !== 'supervisor' && role !== 'pendamping') {
    throw new Error('Akun ini belum memiliki peran SIPANDU yang sah untuk mengelola dokumen.');
  }
  return { user, role };
}

function getDocumentMimeType(file: File): string {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  const mimeType = MIME_BY_EXTENSION[extension];
  if (!mimeType) {
    throw new Error('Format file tidak didukung. Gunakan PDF, DOC/DOCX, JPG/PNG, GIF, WEBP, BMP, TIFF, HEIC, atau HEIF.');
  }
  return mimeType;
}

function explainDocumentError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(message || 'Operasi arsip dokumen SIPANDU gagal.');
}

function toIso(value: unknown): string {
  const candidate = value as { toDate?: () => Date } | null;
  return candidate && typeof candidate.toDate === 'function'
    ? candidate.toDate().toISOString()
    : typeof value === 'string' ? value : '';
}

function mapDocument(id: string, data: Record<string, unknown>): StaffDocumentRecord {
  return {
    id,
    name: String(data.name || 'Dokumen'),
    contentType: String(data.contentType || 'application/octet-stream'),
    size: Number(data.size || 0),
    ownerUid: String(data.ownerUid || ''),
    ownerEmail: String(data.ownerEmail || ''),
    category: data.category === 'surat-lainnya' ? 'surat-lainnya' : 'surat-tugas',
    uploadedAt: toIso(data.uploadedAt),
    driveBackupStatus: data.driveBackupStatus === 'complete' && data.driveFileId ? 'complete' : 'failed',
    driveBackupError: String(data.driveBackupError || ''),
    driveFileId: String(data.driveFileId || ''),
    driveBackupAt: toIso(data.driveBackupAt),
  };
}

export async function uploadStaffDocument(
  file: File,
  category: StaffDocumentCategory,
): Promise<StaffDocumentRecord> {
  if (!file) throw new Error('Pilih file terlebih dahulu.');
  if (file.size <= 0) throw new Error('File kosong tidak dapat diunggah.');
  if (file.size > MAX_DOCUMENT_SIZE) throw new Error('Ukuran file melebihi batas 25 MiB.');
  const { user } = await getVerifiedStaff();
  const contentType = getDocumentMimeType(file);
  const normalizedFile = new File([file], file.name, { type: contentType });
  let driveFile: Awaited<ReturnType<typeof uploadStaffDocumentViaArchiveWorker>> | null = null;
  const documentId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'doc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);

  try {
    driveFile = await uploadStaffDocumentViaArchiveWorker(normalizedFile, category);
    await setDoc(doc(db, 'staffDocuments', documentId), {
      name: file.name.slice(0, 255),
      contentType,
      size: file.size,
      ownerUid: user.uid,
      ownerEmail: user.email || '',
      category,
      uploadedAt: serverTimestamp(),
      driveBackupStatus: 'complete',
      driveBackupError: '',
      driveFileId: driveFile.id,
      driveBackupAt: serverTimestamp(),
      driveBackupUpdatedAt: serverTimestamp(),
    });
    return {
      id: documentId, name: file.name, contentType, size: file.size,
      ownerUid: user.uid, ownerEmail: user.email || '', category,
      uploadedAt: new Date().toISOString(),
      driveBackupStatus: 'complete', driveBackupError: '',
      driveFileId: driveFile.id,
      driveBackupAt: new Date().toISOString(),
    };
  } catch (error) {
    if (driveFile?.id) {
      try { await deleteStaffDocumentViaArchiveWorker(driveFile.id); } catch { /* preserve original error */ }
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
    return snapshot.docs.map((item) => mapDocument(item.id, item.data()));
  } catch (error) {
    throw explainDocumentError(error);
  }
}

export async function downloadStaffDocument(
  record: Pick<StaffDocumentRecord, 'id' | 'driveFileId' | 'ownerUid' | 'size' | 'contentType'>,
): Promise<Blob> {
  const { user, role } = await getVerifiedStaff();
  if (record.ownerUid !== user.uid && role !== 'owner' && role !== 'supervisor') {
    throw new Error('Anda tidak memiliki izin untuk mengunduh dokumen petugas lain.');
  }
  if (!record.driveFileId) throw new Error('Dokumen lama belum memiliki salinan Drive terverifikasi. Unggah ulang file aslinya.');
  try {
    const snapshot = await getDoc(doc(db, 'staffDocuments', record.id));
    if (!snapshot.exists() || String(snapshot.data().driveFileId || '') !== record.driveFileId) {
      throw new Error('Metadata arsip berubah atau dokumen tidak ditemukan. Muat ulang daftar arsip.');
    }
    const blob = await downloadStaffDocumentViaArchiveWorker(record.driveFileId);
    if (blob.size !== Number(record.size)) {
      throw new Error('Ukuran dokumen hasil unduh tidak cocok dengan metadata arsip.');
    }
    const expectedType = String(record.contentType || '');
    if (expectedType && blob.type && blob.type !== expectedType) {
      throw new Error('Tipe dokumen hasil unduh tidak cocok dengan metadata arsip.');
    }
    return blob;
  } catch (error) {
    throw explainDocumentError(error);
  }
}

export async function retryStaffDocumentDriveBackup(
  documentId: string,
  file: File,
): Promise<StaffDocumentRecord> {
  const { user, role } = await getVerifiedStaff();
  const recordRef = doc(db, 'staffDocuments', documentId);
  const snapshot = await getDoc(recordRef);
  if (!snapshot.exists()) throw new Error('Metadata dokumen tidak ditemukan di Firestore.');
  const data = snapshot.data();
  if (data.ownerUid !== user.uid && role !== 'owner' && role !== 'supervisor') {
    throw new Error('Anda hanya dapat mengganti arsip dokumen yang Anda unggah sendiri.');
  }
  if (file.name !== String(data.name || '') || file.size !== Number(data.size || 0)) {
    throw new Error('File yang dipilih tidak sama dengan file arsip. Pilih file asli dengan nama dan ukuran yang sama.');
  }
  const contentType = getDocumentMimeType(file);
  const normalizedFile = new File([file], file.name, { type: contentType });
  const replacement = await uploadStaffDocumentViaArchiveWorker(
    normalizedFile,
    data.category === 'surat-lainnya' ? 'surat-lainnya' : 'surat-tugas',
  );
  const previousDriveFileId = String(data.driveFileId || '');
  try {
    await updateDoc(recordRef, {
      contentType,
      driveBackupStatus: 'complete',
      driveBackupError: '',
      storagePath: deleteField(),
      downloadUrl: deleteField(),
      driveWebViewLink: deleteField(),
      driveFileId: replacement.id,
      driveBackupAt: serverTimestamp(),
      driveBackupUpdatedAt: serverTimestamp(),
    });
  } catch (error) {
    try { await deleteStaffDocumentViaArchiveWorker(replacement.id); } catch { /* preserve Firestore error */ }
    throw explainDocumentError(error);
  }
  if (previousDriveFileId && previousDriveFileId !== replacement.id) {
    try { await deleteStaffDocumentViaArchiveWorker(previousDriveFileId); } catch { /* old file can be cleaned up separately */ }
  }
  return mapDocument(documentId, {
    ...data, contentType, driveBackupStatus: 'complete', driveBackupError: '',
    driveFileId: replacement.id,
    driveBackupAt: new Date().toISOString(),
  });
}

export async function deleteStaffDocument(documentId: string): Promise<void> {
  const { user, role } = await getVerifiedStaff();
  const recordRef = doc(db, 'staffDocuments', documentId);
  const snapshot = await getDoc(recordRef);
  if (!snapshot.exists()) return;
  const data = snapshot.data();
  if (data.ownerUid !== user.uid && role !== 'owner' && role !== 'supervisor') {
    throw new Error('Anda tidak memiliki izin untuk menghapus dokumen petugas lain.');
  }
  const driveFileId = String(data.driveFileId || '');
  try {
    if (driveFileId) await deleteStaffDocumentViaArchiveWorker(driveFileId);
    await deleteDoc(recordRef);
  } catch (error) {
    throw explainDocumentError(error);
  }
}
