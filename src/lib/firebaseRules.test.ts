import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
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

test('Pendamping dapat menyimpan jawaban asesmen walau dokumen roster PPKS belum ada', async () => {
  const firestore = environment.authenticatedContext(PENDAMPING_UID, {
    role: 'pendamping',
  }).firestore();
  const answerDoc = doc(firestore, 'integratedAssessmentAnswers', 'sheet-row-99');
  const officialAnswers = Object.fromEntries([
    ...Array.from({ length: 91 }, (_, index) => [`q${index + 1}`, `Jawaban ${index + 1}`]),
    ['metaSatker', 'Sentra Medan'],
    ['metaYear', '2026'],
    ['metaSequence', '001'],
    ['kesimpulanResumeKasus', 'Kesimpulan hasil asesmen'],
    ['rekomendasiCatatanPetugas', 'Rekomendasi tindak lanjut'],
  ]) as Record<string, string>;

  assert.equal(Object.keys(officialAnswers).length, 96);
  await assertSucceeds(setDoc(answerDoc, {
    ppksId: 'sheet-row-99',
    formAsesmenTerintegrasi: officialAnswers,
    updatedBy: PENDAMPING_UID,
    updatedAt: serverTimestamp(),
  }));

  await assertSucceeds(updateDoc(answerDoc, {
    formAsesmenTerintegrasi: {
      ...officialAnswers,
      metaSatker: 'Sentra Sosial Medan',
      kesimpulanResumeKasus: 'Kesimpulan diperbarui',
    },
    updatedAt: serverTimestamp(),
  }));

  await assertFails(setDoc(doc(firestore, 'integratedAssessmentAnswers', 'wrong-id'), {
    ppksId: 'another-id',
    formAsesmenTerintegrasi: { q1: '2026-11-06' },
    updatedBy: PENDAMPING_UID,
    updatedAt: serverTimestamp(),
  }));

  await assertFails(updateDoc(answerDoc, {
    namaLengkap: 'Tidak boleh mengubah profil utama',
    updatedAt: serverTimestamp(),
  }));

  await assertFails(setDoc(doc(firestore, 'integratedAssessmentAnswers', 'invalid-question'), {
    ppksId: 'invalid-question',
    formAsesmenTerintegrasi: { q92: 'Field di luar formulir' },
    updatedBy: PENDAMPING_UID,
    updatedAt: serverTimestamp(),
  }));

  const nonStaff = environment.authenticatedContext('not-a-staff-member').firestore();
  await assertFails(setDoc(doc(nonStaff, 'integratedAssessmentAnswers', 'blocked'), {
    ppksId: 'blocked',
    formAsesmenTerintegrasi: { q1: '2026-11-06' },
    updatedBy: 'not-a-staff-member',
    updatedAt: serverTimestamp(),
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



test('Status layanan PPKS dan riwayat aktivitas dibatasi role staf serta riwayat bersifat append-only', async () => {
  const firestore = environment.authenticatedContext('owner-001', {
    role: 'owner',
  }).firestore();
  const status = doc(firestore, 'ppksServiceStatus', 'ppks-demo');

  await assertSucceeds(setDoc(status, {
    ppksId: 'ppks-demo',
    nutritionStatus: 'dibutuhkan',
    entrepreneurshipStatus: 'belum-diverifikasi',
    psychosocialStatus: 'belum-dimulai',
    lastNutritionAt: '',
    lastEntrepreneurshipAt: '',
    lastTherapyAt: '',
    therapySessionCount: 0,
    followUpAt: '2026-11-15',
    followUpReason: 'konfirmasi-penerimaan-bantuan',
    assignedToUid: PENDAMPING_UID,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedByUid: 'owner-001',
  }));

  await assertSucceeds(updateDoc(status, {
    nutritionStatus: 'diterima',
    lastNutritionAt: '2026-11-08',
    updatedAt: serverTimestamp(),
    updatedByUid: 'owner-001',
  }));

  await assertFails(updateDoc(status, {
    assignedToUid: 'pendamping-lain',
    updatedAt: serverTimestamp(),
    updatedByUid: 'owner-001',
  }));
  await assertFails(updateDoc(status, {
    clinicalDiagnosis: 'field tidak diizinkan',
    updatedAt: serverTimestamp(),
    updatedByUid: 'owner-001',
  }));
  await assertFails(setDoc(doc(firestore, 'ppksServiceStatus', 'invalid'), {
    ppksId: 'invalid',
    nutritionStatus: 'diterima',
    entrepreneurshipStatus: 'belum-diverifikasi',
    psychosocialStatus: 'belum-dimulai',
    lastNutritionAt: '',
    lastEntrepreneurshipAt: '',
    lastTherapyAt: '',
    therapySessionCount: 0,
    followUpAt: '',
    followUpReason: '',
    assignedToUid: 'another-staff',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedByUid: 'owner-001',
  }));

  const event = doc(firestore, 'ppksServiceEvents', 'event-001');
  await assertSucceeds(setDoc(event, {
    id: 'event-001',
    ppksId: 'ppks-demo',
    eventType: 'nutrition-assistance',
    status: 'diterima',
    serviceDate: '2026-11-08',
    followUpAt: '',
    followUpReason: '',
    createdByUid: 'owner-001',
    assignedToUid: PENDAMPING_UID,
    createdAt: serverTimestamp(),
  }));
  await assertFails(updateDoc(event, { status: 'dibutuhkan' }));
  await assertFails(deleteDoc(event));

  const outsider = environment.authenticatedContext('outsider-001').firestore();
  await assertFails(getDoc(doc(outsider, 'ppksServiceStatus', 'ppks-demo')));
  await assertFails(setDoc(doc(outsider, 'ppksServiceEvents', 'event-outsider'), {
    id: 'event-outsider',
    ppksId: 'ppks-demo',
    eventType: 'nutrition-assistance',
    status: 'diterima',
    serviceDate: '2026-11-08',
    followUpAt: '',
    followUpReason: '',
    createdByUid: 'outsider-001',
    assignedToUid: 'outsider-001',
    createdAt: serverTimestamp(),
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
      // Older app builds may have kept additional metadata on this same
      // UID-owned profile document; unrelated legacy fields must be preserved.
      legacyProfileFlag: 'preserve-me',
    });
  });
  const legacyContext = environment.authenticatedContext('legacy-member', {
    email: 'legacy@example.test',
    email_verified: true,
  }).firestore();
  const legacyProfileRef = doc(legacyContext, 'userProfiles', 'legacy-member');
  await assertSucceeds(updateDoc(legacyProfileRef, {
    email: 'legacy@example.test',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    nama: 'Petugas Lama Diperbarui',
  }));
  // Legacy fields are preserved but cannot be modified by the profile editor.
  await assertFails(updateDoc(legacyProfileRef, {
    legacyProfileFlag: 'tampered',
    updatedAt: serverTimestamp(),
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
