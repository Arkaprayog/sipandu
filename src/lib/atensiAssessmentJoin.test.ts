import test from 'node:test';
import assert from 'node:assert/strict';
import type { PPKSRecord } from '../types';
import { mergeAtensiArvDurations } from './atensiAssessmentJoin';

function record(overrides: Partial<PPKSRecord> = {}): PPKSRecord {
  return {
    id: 'ppks-deny',
    timestamp: '2026-11-01T09:00:00',
    namaLengkap: 'Deny Arifin Martyon Sikumbang',
    nik: '0000000000000123',
    usia: 33,
    jenisKelamin: 'Laki-laki',
    kotaDomisili: 'Kab Deli Serdang',
    alamatLengkap: '',
    noHpWa: '081234567890',
    jenisBantuan: '',
    intervensiMental: '',
    desil: 2,
    fotoDiri: '',
    fotoKtp: '',
    statusAsesmen: 'Tahap Awal',
    ...overrides,
  };
}

test('joins AO ARV duration to the exact PPKS identity', () => {
  const profile = record();
  const assessment = record({ timestamp: '2026-11-02T12:00:00', lamaTerapiArv: '5 tahun' });
  const result = mergeAtensiArvDurations([profile], [assessment]);
  assert.equal(result.matched, 1);
  assert.equal(result.records[0].lamaTerapiArv, '5 tahun');
});

test('does not join a same-name assessment row with a conflicting NIK', () => {
  const profile = record();
  const assessment = record({ nik: '0000000000000456', lamaTerapiArv: '5 tahun' });
  const result = mergeAtensiArvDurations([profile], [assessment]);
  assert.equal(result.matched, 0);
  assert.equal(result.records[0].lamaTerapiArv, undefined);
});

test('uses unique full name only when the assessment row has no NIK', () => {
  const profile = record({ nik: '' });
  const assessment = record({ nik: '', lamaTerapiArv: '3 tahun' });
  const result = mergeAtensiArvDurations([profile], [assessment]);
  assert.equal(result.matched, 1);
  assert.equal(result.records[0].lamaTerapiArv, '3 tahun');
});

test('does not use ambiguous name-only matches', () => {
  const first = record({ nik: '', id: 'p1' });
  const second = record({ nik: '', id: 'p2' });
  const assessment = record({ nik: '', id: 'a1', lamaTerapiArv: '4 tahun' });
  const result = mergeAtensiArvDurations([first, second], [assessment]);
  assert.equal(result.matched, 0);
  assert.equal(result.records.every((item) => !item.lamaTerapiArv), true);
});
