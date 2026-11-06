import test from 'node:test';
import assert from 'node:assert/strict';
import { isLegacySamplePPKSId, isObviousDemoMarker } from './initialData';

test('cleanup recognises common Indonesian demo markers but preserves ordinary names', () => {
  assert.equal(isObviousDemoMarker('Uji Coba'), true);
  assert.equal(isObviousDemoMarker('UJI-COBA: PPKS'), true);
  assert.equal(isObviousDemoMarker('Data Uji PPKS'), true);
  assert.equal(isObviousDemoMarker('Uji_Data'), true);
  assert.equal(isObviousDemoMarker('PPKS Sample 001'), true);
  assert.equal(isObviousDemoMarker('Budi Santoso'), false);
  assert.equal(isObviousDemoMarker('Dewi Sample Lubis'), false);
});

test('authoritative sheet filtering uses retired demo IDs, not respondent names', () => {
  assert.equal(isLegacySamplePPKSId('PPKS-SU-2026-001'), true);
  assert.equal(isLegacySamplePPKSId('SHEET-2a1b3c'), false);
  assert.equal(isLegacySamplePPKSId('Dewi Sartika Lubis'), false);
});
