import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeExactNumericNIK } from './nikNumeric';

test('recovers a 16-digit NIK from an exact safe Google Sheets number', () => {
  assert.equal(normalizeExactNumericNIK(1271011505920003), '1271011505920003');
});

test('does not guess NIK digits from unsafe numbers, short values, or strings', () => {
  assert.equal(normalizeExactNumericNIK(9007199254740992), '');
  assert.equal(normalizeExactNumericNIK(12345), '');
  assert.equal(normalizeExactNumericNIK('1271011505920003'), '');
  assert.equal(normalizeExactNumericNIK(1.271011505920003e15), '1271011505920003');
});
