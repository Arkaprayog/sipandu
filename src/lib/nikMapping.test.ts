import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findNIKHeaders,
  isLikelyRespondentNIKHeader,
  normalizeNIKCellValue,
  readNIKFromSheetRow,
} from './nikMapping';

test('maps a standard Indonesian NIK header and preserves 16 digits', () => {
  const headers = ['Timestamp', 'Nama Lengkap', 'Nomor Induk Kependudukan (NIK) sesuai KTP responden'];
  const row = ['2026-10-25 10:15:00', 'Budi Santoso', '1271011505920003'];
  assert.equal(readNIKFromSheetRow(headers, row), '1271011505920003');
  assert.deepEqual(findNIKHeaders(headers), [headers[2]]);
});

test('maps common Google Forms KTP/NIK question labels', () => {
  const labels = [
    'No. KTP/NIK responden (16 digit)',
    'NIK PPKS',
    'Nomor KTP sesuai e-KTP',
    'Nomor Identitas Responden (NIK)',
    'No Induk Kependudukan',
    'National ID Number',
  ];
  for (const label of labels) {
    assert.equal(isLikelyRespondentNIKHeader(label), true, label);
  }
  assert.equal(readNIKFromSheetRow([labels[0]], ['32.7601.700195.0001']), '3276017001950001');
});

test('does not select a relative or a KTP/photo upload column as respondent NIK', () => {
  assert.equal(isLikelyRespondentNIKHeader('Nomor Induk Kependudukan Ayah'), false);
  assert.equal(isLikelyRespondentNIKHeader('Nomor KTP Kontak Darurat'), false);
  assert.equal(isLikelyRespondentNIKHeader('Upload Foto KTP Responden'), false);
  const headers = [
    'Nomor Induk Kependudukan Ayah',
    'Upload Foto KTP Responden',
    'NIK Responden',
  ];
  const row = ['3276017001950001', 'https://drive.google.com/file/d/abc/view', '1271011505920003'];
  assert.equal(readNIKFromSheetRow(headers, row), '1271011505920003');
});

test('tries duplicate NIK columns when the first one is blank', () => {
  const headers = ['Nama', 'NIK', 'NIK'];
  const row = ['Budi Santoso', '', '1271011505920003'];
  assert.equal(readNIKFromSheetRow(headers, row), '1271011505920003');
});

test('normalizes separators but refuses scientific notation and ambiguous values', () => {
  assert.equal(normalizeNIKCellValue('12.7101.150592.0003'), '1271011505920003');
  assert.equal(normalizeNIKCellValue('NIK: 1271011505920003'), '1271011505920003');
  assert.equal(normalizeNIKCellValue('1.27101150592000E+15'), '');
  assert.equal(normalizeNIKCellValue('1271011505920003 / 3276017001950001'), '');
  assert.equal(normalizeNIKCellValue('1271011505'), '');
});
