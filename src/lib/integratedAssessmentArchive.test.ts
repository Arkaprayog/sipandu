import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PPKSRecord } from '../types';
import {
  getCloudOnlyCompletedAssessments,
  hasCompletedIntegratedAnswers,
  mergeIntegratedAssessmentAnswers,
  isIntegratedAssessmentAnswerKey,
} from './integratedAssessmentArchive';

function record(id: string, answers: Record<string, string | string[]>): PPKSRecord {
  return { id, formAsesmenTerintegrasi: answers } as unknown as PPKSRecord;
}

test('identity-only prefilled fields do not create a false document archive entry', () => {
  assert.equal(hasCompletedIntegratedAnswers(record('identity-only', {
    q16: 'Nama Responden',
    q23: '1234567890123456',
  })), false);
});

test('a non-identity integrated assessment answer is recognized as an archived document', () => {
  assert.equal(hasCompletedIntegratedAnswers(record('completed', {
    q16: 'Nama Responden',
    q23: '1234567890123456',
    q1: '2026-11-06',
  })), true);
});

test('cloud-only completed assessments are added without importing unrelated stale PPKS records', () => {
  const existing = record('already-local', { q1: '2026-11-06' });
  const cloudOnly = record('cloud-only', { q8: 'Kebutuhan pendampingan' });
  const staleWithoutAssessment = record('stale-roster-only', {});
  const result = getCloudOnlyCompletedAssessments(
    [existing],
    [existing, cloudOnly, staleWithoutAssessment],
  );

  assert.deepEqual(result.map((item) => item.id), ['cloud-only']);
});

test('cloud-only archive collection does not duplicate a local document', () => {
  const local = record('same-id', { q1: 'Sudah disimpan' });
  const cloud = record('same-id', { q1: 'Sudah disimpan' });
  assert.deepEqual(getCloudOnlyCompletedAssessments([local], [cloud]), []);
});


test('separate Firestore answers overlay the spreadsheet record without changing respondent profile fields', () => {
  const local = {
    ...record('sheet-row-12', { q1: 'Jawaban lama', q16: 'Nama sesuai roster' }),
    namaLengkap: 'Nama Responden',
    nik: '1234567890123456',
    alamatLengkap: 'Alamat dari spreadsheet',
  } as PPKSRecord;
  const merged = mergeIntegratedAssessmentAnswers([local], {
    'sheet-row-12': { q1: 'Jawaban terbaru', q2: 'Intervensi' },
  });

  assert.equal(merged[0].formAsesmenTerintegrasi?.q1, 'Jawaban terbaru');
  assert.equal(merged[0].formAsesmenTerintegrasi?.q2, 'Intervensi');
  assert.equal(merged[0].namaLengkap, 'Nama Responden');
  assert.equal(merged[0].nik, '1234567890123456');
  assert.equal(merged[0].alamatLengkap, 'Alamat dari spreadsheet');
});

test('separate answers do not create a partial respondent when the spreadsheet roster does not contain its ID', () => {
  const local = record('known-record', { q1: 'Ada' });
  const result = mergeIntegratedAssessmentAnswers([local], {
    'missing-roster-record': { q1: 'Jawaban tersimpan' },
  });

  assert.deepEqual(result, [local]);
});

test('unchanged separate answers preserve roster list and record references', () => {
  const local = record('same-record', { q1: 'Tetap' });
  const records = [local];
  const result = mergeIntegratedAssessmentAnswers(records, {
    'same-record': { q1: 'Tetap' },
  });

  assert.equal(result, records);
  assert.equal(result[0], local);
});


test('the answer key whitelist includes all 91 questions and the five official supplemental fields only', () => {
  for (let question = 1; question <= 91; question += 1) {
    assert.equal(isIntegratedAssessmentAnswerKey(`q${question}`), true);
  }
  for (const key of [
    'metaSatker',
    'metaYear',
    'metaSequence',
    'kesimpulanResumeKasus',
    'rekomendasiCatatanPetugas',
  ]) {
    assert.equal(isIntegratedAssessmentAnswerKey(key), true);
  }
  for (const key of ['q0', 'q92', 'metaOwner', 'namaLengkap', 'nik', 'statusAsesmen']) {
    assert.equal(isIntegratedAssessmentAnswerKey(key), false);
  }
});


test('supplemental assessment fields survive the Firestore answer overlay', () => {
  const local = {
    ...record('sheet-row-supplemental', { q1: 'Tanggal lama' }),
    namaLengkap: 'Responden Uji',
    nik: '1234567890123456',
  } as PPKSRecord;
  const merged = mergeIntegratedAssessmentAnswers([local], {
    'sheet-row-supplemental': {
      q1: 'Tanggal baru',
      metaSatker: 'Sentra Medan',
      metaYear: '2026',
      metaSequence: '004',
      kesimpulanResumeKasus: 'Kesimpulan asesmen',
      rekomendasiCatatanPetugas: 'Rekomendasi tindak lanjut',
    },
  });

  assert.deepEqual(merged[0].formAsesmenTerintegrasi, {
    q1: 'Tanggal baru',
    metaSatker: 'Sentra Medan',
    metaYear: '2026',
    metaSequence: '004',
    kesimpulanResumeKasus: 'Kesimpulan asesmen',
    rekomendasiCatatanPetugas: 'Rekomendasi tindak lanjut',
  });
  assert.equal(merged[0].namaLengkap, 'Responden Uji');
  assert.equal(merged[0].nik, '1234567890123456');
});
