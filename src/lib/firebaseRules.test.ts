import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { getBytes, ref, uploadBytes } from 'firebase/storage';

const PROJECT_ID = 'demo-sipandu-rules';
const PENDAMPING_UID = 'pendamping-001';
let environment: RulesTestEnvironment;

before(async () => {
  const [firestoreRules, storageRules] = await Promise.all([
    readFile('firestore.rules', 'utf8'),
    readFile('storage.rules', 'utf8'),
  ]);
  environment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: firestoreRules },
    storage: { rules: storageRules },
  });
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'ppks', 'ppks-demo'), {
      id: 'ppks-demo',
      namaLengkap: 'Responden Contoh',
      nik: '1234567890123456',
      statusAsesmen: 'Lanjutan',
    });
  });
});

after(async () => {
  if (!environment) return;
  await environment.clearFirestore();
  await environment.clearStorage();
  await environment.cleanup();
});

test('Pendamping hanya dapat mengubah map Form Asesmen Terintegrasi pada PPKS', async () => {
  const firestore = environment.authenticatedContext(PENDAMPING_UID, {
    role: 'pendamping',
  }).firestore();

  await assertSucceeds(updateDoc(doc(firestore, 'ppks', 'ppks-demo'), {
    formAsesmenTerintegrasi: { q1: '2026-11-05', q16: 'Responden Contoh' },
  }));

  await assertFails(updateDoc(doc(firestore, 'ppks', 'ppks-demo'), {
    nik: '0000000000000000',
  }));
  await assertFails(updateDoc(doc(firestore, 'ppks', 'ppks-demo'), {
    statusAsesmen: 'Selesai',
  }));
});

test('Dokumen staf hanya dapat dibuat pada folder pemilik dan backup Drive hanya mengubah metadata', async () => {
  const firestore = environment.authenticatedContext(PENDAMPING_UID, {
    role: 'pendamping',
  }).firestore();
  const record = doc(firestore, 'staffDocuments', 'document-001');

  await assertSucceeds(setDoc(record, {
    name: 'bukti.pdf',
    contentType: 'application/pdf',
    size: 4,
    storagePath: `staff-documents/${PENDAMPING_UID}/document-001/bukti.pdf`,
    downloadUrl: 'https://firebasestorage.googleapis.com/example-tokenized-url',
    ownerUid: PENDAMPING_UID,
    ownerEmail: 'pendamping@example.test',
    category: 'surat-tugas',
    uploadedAt: serverTimestamp(),
    driveBackupStatus: 'pending',
    driveBackupError: '',
    driveFileId: '',
    driveWebViewLink: '',
    driveBackupAt: null,
    driveBackupUpdatedAt: serverTimestamp(),
  }));

  await assertSucceeds(updateDoc(record, {
    driveBackupStatus: 'complete',
    driveBackupError: '',
    driveFileId: 'drive-file-001',
    driveWebViewLink: 'https://drive.google.com/open?id=drive-file-001',
    driveBackupAt: serverTimestamp(),
    driveBackupUpdatedAt: serverTimestamp(),
  }));

  await assertFails(updateDoc(record, { name: 'diubah.pdf' }));
  await assertFails(setDoc(doc(firestore, 'staffDocuments', 'foreign-document'), {
    name: 'foreign.pdf',
    contentType: 'application/pdf',
    size: 4,
    storagePath: 'staff-documents/another-user/foreign-document/foreign.pdf',
    downloadUrl: 'https://example.test/file',
    ownerUid: PENDAMPING_UID,
    ownerEmail: '',
    category: 'surat-tugas',
    uploadedAt: serverTimestamp(),
    driveBackupStatus: 'pending',
    driveBackupError: '',
    driveFileId: '',
    driveWebViewLink: '',
    driveBackupAt: null,
    driveBackupUpdatedAt: serverTimestamp(),
  }));
});

test('Metadata arsip asesmen dan surat dibuat hanya dengan skema yang diizinkan', async () => {
  const firestore = environment.authenticatedContext(PENDAMPING_UID, {
    role: 'pendamping',
  }).firestore();

  await assertSucceeds(setDoc(doc(firestore, 'integratedAssessmentBackups', 'ppks-demo'), {
    ppksId: 'ppks-demo',
    driveBackupStatus: 'complete',
    driveBackupError: '',
    driveFileId: 'assessment-drive-001',
    driveWebViewLink: 'https://drive.google.com/open?id=assessment-drive-001',
    savedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));

  await assertSucceeds(setDoc(doc(firestore, 'staffLetters', 'SRT-001'), {
    id: 'SRT-001',
    nomorSurat: 'ST/001/2026',
    judul: 'Surat Tugas',
    jenis: 'Surat Tugas',
    tanggal: '2026-11-05',
    petugas: 'Petugas SIPANDU',
    nipPetugas: '199212132019091001',
    lokasi: 'Medan',
    status: 'Aktif',
    deskripsi: 'Pelaksanaan kegiatan koordinasi layanan.',
    ownerUid: PENDAMPING_UID,
    ownerEmail: 'pendamping@example.test',
    createdAt: serverTimestamp(),
    driveBackupStatus: 'pending',
    driveBackupError: '',
    driveFileId: '',
    driveWebViewLink: '',
    driveBackupAt: null,
    driveBackupUpdatedAt: serverTimestamp(),
  }));
});

test('Firebase Storage membatasi upload PDF ke folder staf yang sedang masuk', async () => {
  const staffStorage = environment.authenticatedContext(PENDAMPING_UID, {
    role: 'pendamping',
  }).storage();
  const pdf = new Blob(['%PDF'], { type: 'application/pdf' });

  const ownFile = ref(staffStorage, `staff-documents/${PENDAMPING_UID}/document-002/bukti.pdf`);
  await assertSucceeds(uploadBytes(ownFile, pdf, { contentType: 'application/pdf' }));
  const bytes = await assertSucceeds(getBytes(ownFile));
  assert.equal(bytes.byteLength, 4);

  const foreignFile = ref(staffStorage, 'staff-documents/other-user/document-003/foreign.pdf');
  await assertFails(uploadBytes(foreignFile, pdf, { contentType: 'application/pdf' }));

  const anonymousStorage = environment.unauthenticatedContext().storage();
  const anonymousFile = ref(anonymousStorage, `staff-documents/${PENDAMPING_UID}/document-004/anonymous.pdf`);
  await assertFails(uploadBytes(anonymousFile, pdf, { contentType: 'application/pdf' }));
});


test('Profil anggota hanya dapat dibaca dan diubah oleh pemilik UID serta tidak dapat menetapkan role', async () => {
  const ownContext = environment.authenticatedContext('member-001', {
    email: 'member@example.test',
    email_verified: true,
  });
  const ownProfile = doc(ownContext.firestore(), 'userProfiles', 'member-001');

  await assertSucceeds(setDoc(ownProfile, {
    nama: 'Anggota SIPANDU',
    nip: '199001012020121001',
    jabatan: 'Pendamping Sosial',
    unitKerja: 'Sentra Layanan',
    noHp: '',
    photoUrl: '',
    email: 'member@example.test',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));

  await assertSucceeds(updateDoc(ownProfile, {
    photoUrl: 'data:image/jpeg;base64,ZmFrZQ==',
    updatedAt: serverTimestamp(),
  }));

  // The owner may correct their private email metadata without changing UID
  // ownership or gaining access to another profile.
  const differentlyCasedEmailContext = environment.authenticatedContext('member-001', {
    email: 'Member@example.test',
    email_verified: true,
  });
  await assertSucceeds(updateDoc(
    doc(differentlyCasedEmailContext.firestore(), 'userProfiles', 'member-001'),
    { email: 'Member@example.test', updatedAt: serverTimestamp() },
  ));

  // Backfill legacy records that predate the cloud-profile timestamps/email.
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'userProfiles', 'legacy-member'), {
      nama: 'Petugas Lama',
      nip: '199001012020121001',
      jabatan: 'Pendamping Sosial',
      unitKerja: 'Sentra Layanan',
      noHp: '',
      photoUrl: '',
    });
  });
  const legacyContext = environment.authenticatedContext('legacy-member', {
    email: 'legacy@example.test',
    email_verified: true,
  }).firestore();
  await assertSucceeds(updateDoc(doc(legacyContext, 'userProfiles', 'legacy-member'), {
    email: 'legacy@example.test',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    nama: 'Petugas Lama Diperbarui',
  }));

  await assertFails(updateDoc(ownProfile, {
    role: 'owner',
    updatedAt: serverTimestamp(),
  }));

  // A valid Firebase UID session may not carry an email custom claim in every
  // auth provider. UID ownership alone authorizes its private profile document.
  const noEmailClaimContext = environment.authenticatedContext('member-no-email');
  const noEmailClaimProfile = doc(noEmailClaimContext.firestore(), 'userProfiles', 'member-no-email');
  await assertSucceeds(setDoc(noEmailClaimProfile, {
    nama: 'Anggota Tanpa Email Claim',
    nip: '199001012020121001',
    jabatan: 'Pendamping Sosial',
    unitKerja: 'Sentra Layanan',
    noHp: '',
    photoUrl: '',
    email: 'anggota@example.test',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));
  await assertSucceeds(updateDoc(noEmailClaimProfile, {
    nama: 'Profil Diperbarui',
    updatedAt: serverTimestamp(),
  }));

  const otherContext = environment.authenticatedContext('member-002', {
    email: 'other@example.test',
    email_verified: true,
  });
  await assertFails(getDoc(doc(otherContext.firestore(), 'userProfiles', 'member-001')));
  await assertFails(setDoc(doc(otherContext.firestore(), 'userProfiles', 'member-001'), {
    nama: 'Tidak boleh',
    nip: '1',
    jabatan: 'Uji',
    unitKerja: 'Uji',
    noHp: '',
    photoUrl: '',
    email: 'member@example.test',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));
});
