import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeOklchColor, replaceOklchColors } from './cssColorCompatibility';

test('converts a CSS Color 4 oklch red to sRGB', () => {
  assert.equal(normalizeOklchColor('oklch(0.627955 0.257683 29.233)'), 'rgba(255, 0, 0, 1)');
});

test('supports percentage lightness and alpha', () => {
  assert.equal(normalizeOklchColor('oklch(100% 0 0 / 50%)'), 'rgba(255, 255, 255, 0.5)');
});

test('supports hue angle units', () => {
  assert.equal(
    normalizeOklchColor('oklch(0.627955 0.257683 0.081203turn)'),
    'rgba(255, 0, 0, 1)',
  );
});

test('leaves non-oklch CSS values intact and replaces nested colors', () => {
  assert.equal(replaceOklchColors('#fff'), '#fff');
  assert.equal(
    replaceOklchColors('linear-gradient(oklch(0.627955 0.257683 29.233), #fff)'),
    'linear-gradient(rgba(255, 0, 0, 1), #fff)',
  );
});

test('returns null for malformed or unsupported color syntax', () => {
  assert.equal(normalizeOklchColor('oklch(0.5 0.2)'), null);
  assert.equal(normalizeOklchColor('rgb(255 0 0)'), null);
});
