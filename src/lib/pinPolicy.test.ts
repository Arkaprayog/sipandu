import test from 'node:test';
import assert from 'node:assert/strict';
import { isAppPinFormatValid } from './pinPolicy';

test('accepts exactly four numeric digits, including leading zeroes', () => {
  assert.equal(isAppPinFormatValid('0000'), true);
  assert.equal(isAppPinFormatValid('0427'), true);
  assert.equal(isAppPinFormatValid('9816'), true);
});

test('rejects non-four-digit or non-numeric PIN values', () => {
  for (const value of ['', '123', '12345', '12a4', ' 123', '１２３４']) {
    assert.equal(isAppPinFormatValid(value), false, JSON.stringify(value));
  }
});
