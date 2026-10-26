import test from 'node:test';
import assert from 'node:assert/strict';
import { deduplicatePPKSRecords, EXPECTED_REAL_PPKS_COUNT, formatPPKSTimestamp, samePPKSIdentity, sortPPKSRecordsByName } from './ppksData';
import type { PPKSRecord } from '../types';

function record(overrides: Partial<PPKSRecord> = {}): PPKSRecord {
  return {
    id: 'record-1',
    timestamp: '10/25/2026 10:00:00 AM',
    namaLengkap: 'Lesmana',
    nik: '1271011505920003',
    usia: 34,
    jenisKelamin: 'Laki-laki',
    kotaDomisili: 'Medan',
    alamatLengkap: 'Jalan Contoh',
    noHpWa: '081234567890',
    jenisBantuan: '',
    intervensiMental: '',
    desil: 0,
    fotoDiri: '',
    fotoKtp: '',
    statusAsesmen: 'Tahap Awal',
    ...overrides,
  };
}

test('deduplicates multiple records for the same person and keeps the newest timestamp/details', () => {
  const older = record({ fotoDiri: 'https://example.test/foto.jpg' });
  const newer = record({
    id: 'record-2',
    timestamp: '10/26/2026 11:29:19 AM',
    namaLengkap: 'LES MANA',
    fotoDiri: '',
    fotoKtp: 'https://example.test/ktp.jpg',
  });
  const result = deduplicatePPKSRecords([older, newer]);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'record-2');
  assert.equal(result[0].timestamp, '10/26/2026 11:29:19 AM');
  assert.equal(result[0].fotoDiri, 'https://example.test/foto.jpg');
  assert.equal(result[0].fotoKtp, 'https://example.test/ktp.jpg');
});

test('does not combine people with a different confirmed NIK or conflicting phone number', () => {
  const first = record();
  const differentNik = record({ id: 'record-2', nik: '1271011505920004' });
  const differentPhone = record({ id: 'record-3', nik: '', noHpWa: '089999999999' });
  assert.equal(samePPKSIdentity(first, differentNik), false);
  assert.equal(samePPKSIdentity(first, differentPhone), false);
  assert.equal(deduplicatePPKSRecords([first, differentNik, differentPhone]).length, 3);
});

test('deduplicates on NIK stored only in official assessment q23 and preserves both photos', () => {
  const first = record({
    nik: '',
    namaLengkap: 'Nama Lama',
    noHpWa: '081111111111',
    fotoDiri: 'https://example.test/diri.jpg',
    officialAssessment: { q23: '1271011505920003', q24: 'jawaban lama' },
  });
  const second = record({
    id: 'record-q23',
    nik: '',
    namaLengkap: 'Nama Yang Diperbarui',
    noHpWa: '082222222222',
    fotoKtp: 'https://example.test/ktp-q23.jpg',
    officialAssessment: { q23: '1271011505920003', q25: 'jawaban baru' },
  });
  const result = deduplicatePPKSRecords([first, second]);
  assert.equal(result.length, 1);
  assert.equal(result[0].nik, '1271011505920003');
  assert.equal(result[0].fotoDiri, 'https://example.test/diri.jpg');
  assert.equal(result[0].fotoKtp, 'https://example.test/ktp-q23.jpg');
  assert.equal(result[0].officialAssessment?.q24, 'jawaban lama');
  assert.equal(result[0].officialAssessment?.q25, 'jawaban baru');
});

test('does not merge same-name rows without a matching identity signal', () => {
  const first = record({
    nik: '',
    noHpWa: '',
    namaLengkap: 'Responden A',
    timestamp: '2026-10-25T09:00:00',
  });
  const second = record({
    id: 'record-anon-2',
    nik: '',
    noHpWa: '',
    namaLengkap: 'Responden A',
    timestamp: '2026-10-26T09:00:00',
  });
  assert.equal(samePPKSIdentity(first, second), false);
  assert.equal(deduplicatePPKSRecords([first, second]).length, 2);
});

test('sorts PPKS names alphabetically from Lesmana to Tukinem', () => {
  const sorted = sortPPKSRecordsByName([
    record({ namaLengkap: 'Tukinem' }),
    record({ namaLengkap: 'Lesmana' }),
    record({ namaLengkap: 'Sulastri' }),
  ]);
  assert.deepEqual(sorted.map((item) => item.namaLengkap), ['Lesmana', 'Sulastri', 'Tukinem']);
});

test('preserves the original timestamp string received from Google Sheets', () => {
  const sourceValue = '10/26/2026 11:29:19 AM';
  assert.equal(formatPPKSTimestamp(sourceValue), sourceValue);
});

test('the destructive Firestore reconciliation guard matches the verified 44-person roster', () => {
  assert.equal(EXPECTED_REAL_PPKS_COUNT, 44);
});
