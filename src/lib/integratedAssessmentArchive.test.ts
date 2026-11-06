import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PPKSRecord } from '../types';
import {
  getCloudOnlyCompletedAssessments,
  hasCompletedIntegratedAnswers,
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
