import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ATENSI_PHOTO_COLUMN_INDICES,
  ATENSI_PROFILE_COLUMN_INDEX,
  readAtensiProfileCell,
} from './atensiColumnMapping';

test('ATENSI profile mapping uses the requested spreadsheet columns', () => {
  assert.deepEqual(ATENSI_PROFILE_COLUMN_INDEX, {
    timestamp: 0,
    namaLengkap: 2,
    nik: 3,
    fotoDiri: 4,
    fotoKtp: 5,
    fotoKk: 6,
    fotoRumah: 7,
    kotaDomisili: 8,
    alamatLengkap: 10,
    usia: 11,
    noHpWa: 13,
    jenisBantuan: 39,
    intervensiMental: 40,
    desil: 41,
  });
  assert.deepEqual(ATENSI_PHOTO_COLUMN_INDICES, [4, 5, 6, 7]);
});

test('ATENSI cell reader maps AO recommendation and other profile fields without header dependence', () => {
  const row = Array.from({ length: 42 }, (_, index) => `COLUMN-${index + 1}`);
  assert.equal(readAtensiProfileCell(row, 'timestamp'), 'COLUMN-1');
  assert.equal(readAtensiProfileCell(row, 'namaLengkap'), 'COLUMN-3');
  assert.equal(readAtensiProfileCell(row, 'nik'), 'COLUMN-4');
  assert.equal(readAtensiProfileCell(row, 'fotoDiri'), 'COLUMN-5');
  assert.equal(readAtensiProfileCell(row, 'fotoKtp'), 'COLUMN-6');
  assert.equal(readAtensiProfileCell(row, 'fotoKk'), 'COLUMN-7');
  assert.equal(readAtensiProfileCell(row, 'fotoRumah'), 'COLUMN-8');
  assert.equal(readAtensiProfileCell(row, 'kotaDomisili'), 'COLUMN-9');
  assert.equal(readAtensiProfileCell(row, 'alamatLengkap'), 'COLUMN-11');
  assert.equal(readAtensiProfileCell(row, 'usia'), 'COLUMN-12');
  assert.equal(readAtensiProfileCell(row, 'noHpWa'), 'COLUMN-14');
  assert.equal(readAtensiProfileCell(row, 'jenisBantuan'), 'COLUMN-40');
  assert.equal(readAtensiProfileCell(row, 'intervensiMental'), 'COLUMN-41');
  assert.equal(readAtensiProfileCell(row, 'desil'), 'COLUMN-42');
});

test('ATENSI cell reader returns blank for an empty or missing source cell', () => {
  assert.equal(readAtensiProfileCell([], 'intervensiMental'), '');
  assert.equal(readAtensiProfileCell(['a', 'b', ''], 'namaLengkap'), '');
});
