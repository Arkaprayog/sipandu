import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidVisitSummary, normalizeVisitAssignment } from './fieldVisits';

test('visit summary is required and bounded', () => {
  assert.equal(isValidVisitSummary('Kunjungan dilakukan dan tindak lanjut disepakati.'), true);
  assert.equal(isValidVisitSummary('  '), false);
  assert.equal(isValidVisitSummary('x'.repeat(3001)), false);
});

test('pendamping assignment is always bound to authenticated UID', () => {
  assert.equal(normalizeVisitAssignment('pendamping', 'uid-1', 'uid-2'), 'uid-1');
  assert.equal(normalizeVisitAssignment('supervisor', 'uid-1', 'uid-2'), 'uid-2');
  assert.equal(normalizeVisitAssignment('owner', 'uid-1', ''), 'uid-1');
});
