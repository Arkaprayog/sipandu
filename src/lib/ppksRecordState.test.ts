import assert from 'node:assert/strict';
import test from 'node:test';
import type { PPKSRecord } from '../types';
import { arePPKSRecordListsEqual, preservePPKSRecordOrder } from './ppksRecordState';

function record(id: string, name: string, extra: Partial<PPKSRecord> = {}): PPKSRecord {
  return {
    id,
    timestamp: '2026-10-27T10:00:00.000Z',
    namaLengkap: name,
    nik: '',
    usia: 0,
    jenisKelamin: 'Laki-laki',
    kotaDomisili: '',
    alamatLengkap: '',
    noHpWa: '',
    jenisBantuan: '',
    intervensiMental: '',
    desil: 0,
    fotoDiri: '',
    fotoKtp: '',
    statusAsesmen: 'Tahap Awal',
    ...extra,
  };
}

test('equivalent records with nested data compare equal without JSON serialization', () => {
  const left = [record('1', 'Satu', { officialAssessment: { q1: 'Ya', q2: ['A', 'B'] } })];
  const right = [record('1', 'Satu', { officialAssessment: { q2: ['A', 'B'], q1: 'Ya' } })];
  assert.equal(arePPKSRecordListsEqual(left, right), true);
});

test('record equality detects changes in nested answers and record order', () => {
  assert.equal(arePPKSRecordListsEqual([record('1', 'Satu')], [record('1', 'Dua')]), false);
  assert.equal(
    arePPKSRecordListsEqual([record('1', 'Satu'), record('2', 'Dua')], [record('2', 'Dua'), record('1', 'Satu')]),
    false,
  );
  assert.equal(
    arePPKSRecordListsEqual(
      [record('1', 'Satu', { officialAssessment: { q1: 'Ya' } })],
      [record('1', 'Satu', { officialAssessment: { q1: 'Tidak' } })],
    ),
    false,
  );
});

test('sync preserves the visible roster order and reuses the same array for unchanged data', () => {
  const current = [record('2', 'Dua'), record('1', 'Satu')];
  const reorderedIncoming = [record('1', 'Satu'), record('2', 'Dua')];
  assert.equal(preservePPKSRecordOrder(current, reorderedIncoming), current);

  const updated = preservePPKSRecordOrder(current, [record('1', 'Satu'), record('2', 'Dua', { noHpWa: '08123' })]);
  assert.deepEqual(updated.map((item) => item.id), ['2', '1']);
  assert.equal(updated[0].noHpWa, '08123');
});

test('sync removes stale records and appends new source records in source order', () => {
  const current = [record('2', 'Dua'), record('stale', 'Lama'), record('1', 'Satu')];
  const result = preservePPKSRecordOrder(current, [record('1', 'Satu Baru'), record('3', 'Tiga')]);
  assert.deepEqual(result.map((item) => item.id), ['1', '3']);
  assert.equal(result[0].namaLengkap, 'Satu Baru');
});
