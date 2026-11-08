import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PPKSRecord } from '../types';
import { analyzePPKSDataQuality } from './dataQuality';

const sampleNIK = '1234'.repeat(4);

function makeRecord(overrides: Partial<PPKSRecord> = {}): PPKSRecord {
  return {
    id: 'record-a',
    timestamp: '2026-11-08T08:00:00.000Z',
    namaLengkap: 'Responden Uji',
    nik: sampleNIK,
    usia: 34,
    jenisKelamin: 'Perempuan',
    kotaDomisili: 'Medan',
    alamatLengkap: 'Kota Medan',
    noHpWa: '081234567890',
    jenisBantuan: 'Pemenuhan Nutrisi',
    intervensiMental: '',
    desil: 5,
    fotoDiri: 'https://example.test/portrait.jpg',
    fotoKtp: 'https://example.test/identity.jpg',
    statusAsesmen: 'Tahap Awal',
    ...overrides,
  };
}

test('data valid pada sembilan bidang dasar memiliki kelengkapan 100 persen', () => {
  const report = analyzePPKSDataQuality([makeRecord()]);
  assert.equal(report.totalRecords, 1);
  assert.equal(report.recordsNeedingReview, 0);
  assert.equal(report.completenessPercent, 100);
});

test('NIK duplikat ditandai pada kedua record tanpa menghapus atau menggabungkan data', () => {
  const records = [
    makeRecord({ id: 'record-a' }),
    makeRecord({ id: 'record-b', namaLengkap: 'Responden Kedua' }),
  ];
  const report = analyzePPKSDataQuality(records);
  assert.equal(report.issueCounts['nik-duplikat'], 2);
  assert.equal(report.recordsNeedingReview, 2);
  assert.equal(report.completenessPercent, 100);
  assert.equal(records.length, 2);
});

test('NIK kosong, usia tidak valid, dan foto yang hilang ditandai', () => {
  const report = analyzePPKSDataQuality([makeRecord({
    nik: '',
    usia: 0,
    fotoDiri: '',
    fotoKtp: '',
  })]);
  assert.equal(report.issueCounts['nik-tidak-valid'], 1);
  assert.equal(report.issueCounts['usia-tidak-valid'], 1);
  assert.equal(report.issueCounts['foto-diri-kosong'], 1);
  assert.equal(report.issueCounts['foto-ktp-kosong'], 1);
  assert.equal(report.recordsNeedingReview, 1);
});

test('NIK warisan dibaca tanpa mengubah profil utama', () => {
  const record = makeRecord({ nik: '', officialAssessment: { q23: sampleNIK } });
  const report = analyzePPKSDataQuality([record]);
  assert.equal(report.issueCounts['nik-tidak-valid'], 0);
  assert.equal(record.nik, '');
});
