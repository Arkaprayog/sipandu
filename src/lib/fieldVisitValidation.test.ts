import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidFieldVisitDate } from './fieldVisitValidation';

test('accepts valid ISO calendar dates', () => {
  assert.equal(isValidFieldVisitDate('2026-11-12'), true);
  assert.equal(isValidFieldVisitDate('2000-02-29'), true);
  assert.equal(isValidFieldVisitDate('2024-02-29'), true);
});

test('rejects impossible calendar dates and malformed formats', () => {
  for (const value of [
    '2025-02-29',
    '2026-02-30',
    '2026-04-31',
    '2026-13-01',
    '2026-00-10',
    '2026-11-00',
    '2026-1-02',
    '12/11/2026',
    '2026-11-12T10:00:00',
    ' 2026-11-12',
    '0000-01-01',
  ]) {
    assert.equal(isValidFieldVisitDate(value), false, value);
  }
});

test('allows an empty optional follow-up date but not an empty visit date at the caller', () => {
  assert.equal(isValidFieldVisitDate(''), true);
});
