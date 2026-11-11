import test from 'node:test';
import assert from 'node:assert/strict';
import { deduplicatePPKSRecords, EXPECTED_REAL_PPKS_COUNT, formatPPKSTimestamp, getPPKSNIKCandidates, getSharedPPKSNIK, samePPKSIdentity, sortPPKSRecordsByName } from './ppksData';
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
  const older = record({
    fotoDiri: 'https://example.test/foto.jpg',
    alamatLengkap: 'Alamat dari kolom K',
    lamaTerapiArv: '2 tahun',
  });
  const newer = record({
    id: 'record-2',
    timestamp: '10/26/2026 11:29:19 AM',
    namaLengkap: 'LES MANA',
    fotoDiri: '',
    fotoKtp: 'https://example.test/ktp.jpg',
    alamatLengkap: '',
    lamaTerapiArv: '',
  });
  const result = deduplicatePPKSRecords([older, newer]);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'record-2');
  assert.equal(result[0].timestamp, '10/26/2026 11:29:19 AM');
  assert.equal(result[0].fotoDiri, 'https://example.test/foto.jpg');
  assert.equal(result[0].fotoKtp, 'https://example.test/ktp.jpg');
  assert.equal(result[0].alamatLengkap, 'Alamat dari kolom K');
  assert.equal(result[0].lamaTerapiArv, '2 tahun');
});

test('clears an older address when the newest source response has no current-domicile value', () => {
  const older = record({ alamatLengkap: 'Alamat KTP lama, Sibolga' });
  const newer = record({
    id: 'record-new',
    timestamp: '10/26/2026 11:29:19 AM',
    alamatLengkap: '',
  });
  const result = deduplicatePPKSRecords([older, newer]);
  assert.equal(result.length, 1);
  assert.equal(result[0].alamatLengkap, '');
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
    namaLengkap: 'Nama Lama',
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

test('the destructive Firestore reconciliation guard matches the owner-confirmed 46-person roster', () => {
  assert.equal(EXPECTED_REAL_PPKS_COUNT, 46);
});

test('uses official assessment Q23 to identify a duplicate when the secondary NIK field conflicts', () => {
  const first = record({
    nik: '1271011505920004',
    officialAssessment: { q23: '1271011505920003', q24: 'jawaban pertama' },
    fotoDiri: 'https://example.test/diri.jpg',
  });
  const duplicate = record({
    id: 'record-duplicate',
    timestamp: '10/26/2026 11:29:19 AM',
    nik: '1271011505920005',
    officialAssessment: { q23: '1271011505920003', q25: 'jawaban kedua' },
    fotoKtp: 'https://example.test/ktp.jpg',
  });

  assert.deepEqual(getPPKSNIKCandidates(first), ['1271011505920004', '1271011505920003']);
  assert.equal(getSharedPPKSNIK(first, duplicate), '1271011505920003');
  assert.equal(samePPKSIdentity(first, duplicate), true);

  const merged = deduplicatePPKSRecords([first, duplicate]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].nik, '1271011505920003');
  assert.equal(merged[0].officialAssessment?.q23, '1271011505920003');
  assert.equal(merged[0].officialAssessment?.q24, 'jawaban pertama');
  assert.equal(merged[0].officialAssessment?.q25, 'jawaban kedua');
  assert.equal(merged[0].fotoDiri, 'https://example.test/diri.jpg');
  assert.equal(merged[0].fotoKtp, 'https://example.test/ktp.jpg');
});

test('collapses a 47-row import to the 46 verified unique PPKS when the extra row is a same-name repeat', () => {
  const verified = Array.from({ length: EXPECTED_REAL_PPKS_COUNT }, (_, index) => {
    const nik = String(index + 1).padStart(16, '0');
    return record({
      id: `sheet-row-${index + 2}`,
      namaLengkap: `Responden ${index + 1}`,
      nik,
      timestamp: `2026-10-26T08:${String(index % 60).padStart(2, '0')}:00`,
      officialAssessment: { q23: nik },
    });
  });
  const duplicate = record({
    id: 'sheet-row-46',
    namaLengkap: 'Responden 1',
    nik: '9999999999999999',
    timestamp: '2026-10-26T09:30:00',
    officialAssessment: { q23: '0000000000000001', q24: 'Data tambahan dari pengiriman ulang' },
  });

  const importedRows = [...verified, duplicate];
  assert.equal(importedRows.length, 47);
  const unique = deduplicatePPKSRecords(importedRows);
  assert.equal(unique.length, EXPECTED_REAL_PPKS_COUNT);
  assert.equal(unique.filter((item) => item.officialAssessment?.q24 === 'Data tambahan dari pengiriman ulang').length, 1);
});


test('preserves different respondents when a duplicated or mistyped NIK appears on two distinct rows', () => {
  const first = record({
    id: 'sheet-row-10',
    namaLengkap: 'Responden Pertama',
    nik: '1271011505920003',
    noHpWa: '081111111111',
    timestamp: '2026-10-26T08:00:00',
    officialAssessment: { q23: '1271011505920003' },
  });
  const second = record({
    id: 'sheet-row-11',
    namaLengkap: 'Responden Kedua',
    nik: '1271011505920004',
    noHpWa: '082222222222',
    timestamp: '2026-10-26T09:00:00',
    officialAssessment: { q23: '1271011505920003' },
  });

  assert.equal(samePPKSIdentity(first, second), false);
  assert.equal(deduplicatePPKSRecords([first, second]).length, 2);
});

test('keeps all 46 owner-confirmed respondents when two different people share one NIK', () => {
  const respondents = Array.from({ length: EXPECTED_REAL_PPKS_COUNT }, (_, index) => {
    const nik = String(index + 1).padStart(16, '0');
    return record({
      id: `sheet-row-${index + 2}`,
      namaLengkap: `Responden ${index + 1}`,
      nik,
      noHpWa: `08123456${String(index).padStart(4, '0')}`,
      timestamp: `2026-10-26T08:${String(index).padStart(2, '0')}:00`,
      officialAssessment: { q23: nik },
    });
  });
  const falseNIKCollision: PPKSRecord = {
    ...respondents[45],
    id: 'sheet-row-47',
    namaLengkap: 'Responden Keempat Puluh Enam',
    nik: respondents[0].nik,
    noHpWa: '089999999999',
    timestamp: '2026-10-27T10:00:00',
    officialAssessment: { q23: respondents[0].nik },
  };

  const sourceRows = [...respondents.slice(0, 45), falseNIKCollision];
  assert.equal(sourceRows.length, 46);
  assert.equal(deduplicatePPKSRecords(sourceRows).length, 46);
});
