import test from 'node:test';
import assert from 'node:assert/strict';
import { isObviousDemoMarker } from './initialData';

test('cleanup recognises common Indonesian demo markers but preserves ordinary names', () => {
  assert.equal(isObviousDemoMarker('Uji Coba'), true);
  assert.equal(isObviousDemoMarker('UJI-COBA: PPKS'), true);
  assert.equal(isObviousDemoMarker('Data Uji PPKS'), true);
  assert.equal(isObviousDemoMarker('Uji_Data'), true);
  assert.equal(isObviousDemoMarker('PPKS Sample 001'), true);
  assert.equal(isObviousDemoMarker('Budi Santoso'), false);
  assert.equal(isObviousDemoMarker('Dewi Sample Lubis'), false);
});
