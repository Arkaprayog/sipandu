import { getIdTokenResult } from 'firebase/auth';
import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { backupLetterToCentralDrive, deleteCentralDriveFile } from './googleDriveBackup';
import type { SuratRecord } from '../types';

export interface SavedStaffLetter {
  record: SuratRecord;
  driveBackupStatus: 'pending' | 'complete' | 'failed';
  driveBackupError: string;
  driveFileId: string;
  driveWebViewLink: string;
}

async function assertStaff() {
  const user = auth.currentUser;
  if (!user) throw new Error('Sesi akun SIPANDU tidak tersedia. Masuk kembali sebelum menyimpan surat.');
  const token = await getIdTokenResult(user);
  const role = token.claims.role;
  if (role !== 'owner' && role !== 'supervisor' && role !== 'pendamping') {
    throw new Error('Akun tidak memiliki peran SIPANDU yang sah untuk menyimpan surat.');
  }
  return { user, role };
}

export async function listStaffLettersFromFirestore(): Promise<SavedStaffLetter[]> {
  await assertStaff();
  const snapshot = await getDocs(query(
    collection(db, 'staffLetters'),
    orderBy('createdAt', 'desc'),
    limit(100),
  ));
  return snapshot.docs.map((item) => {
    const data = item.data();
    const record: SuratRecord = {
      id: item.id,
      nomorSurat: String(data.nomorSurat || ''),
      judul: String(data.judul || ''),
      jenis: data.jenis === 'Surat Tugas' ? 'Surat Tugas' : 'Berita Acara',
      tanggal: String(data.tanggal || ''),
      petugas: String(data.petugas || ''),
      nipPetugas: String(data.nipPetugas || ''),
      lokasi: String(data.lokasi || ''),
      status: data.status === 'Selesai' || data.status === 'Arsip' ? data.status : 'Aktif',
      deskripsi: String(data.deskripsi || ''),
    };
    return {
      record,
      driveBackupStatus: data.driveBackupStatus === 'complete' ? 'complete' : 'failed',
      driveBackupError: String(data.driveBackupError || (
        data.driveBackupStatus === 'pending'
          ? 'Backup Google Drive masih menunggu.'
          : 'Surat lama belum memiliki status backup Google Drive.'
      )),
      driveFileId: String(data.driveFileId || ''),
      driveWebViewLink: String(data.driveWebViewLink || ''),
    };
  });
}

export async function saveStaffLetterToFirestore(record: SuratRecord): Promise<SavedStaffLetter> {
  const { user } = await assertStaff();
  if (!record.id || !record.nomorSurat.trim() || !record.judul.trim() || !record.deskripsi.trim()) {
    throw new Error('Nomor surat, judul, uraian, dan ID surat harus lengkap.');
  }
  const recordRef = doc(db, 'staffLetters', record.id);
  await setDoc(recordRef, {
    ...record,
    ownerUid: user.uid,
    ownerEmail: user.email || '',
    createdAt: serverTimestamp(),
    driveBackupStatus: 'pending',
    driveBackupError: '',
    driveFileId: '',
    driveWebViewLink: '',
    driveBackupAt: null,
    driveBackupUpdatedAt: serverTimestamp(),
  });

  let driveBackupStatus: SavedStaffLetter['driveBackupStatus'] = 'failed';
  let driveBackupError = '';
  let driveFileId = '';
  let driveWebViewLink = '';
  try {
    const backup = await backupLetterToCentralDrive(record);
    driveFileId = backup.id;
    driveWebViewLink = backup.webViewLink || '';
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
      try { await deleteCentralDriveFile(driveFileId); } catch { /* keep metadata error */ }
      driveFileId = '';
      driveWebViewLink = '';
      throw metadataError;
    }
  } catch (error) {
    driveBackupError = error instanceof Error ? error.message : String(error);
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
      driveBackupError += ' Status backup gagal dicatat: ' +
        (statusError instanceof Error ? statusError.message : String(statusError));
    }
  }

  return { record, driveBackupStatus, driveBackupError, driveFileId, driveWebViewLink };
}
