import test from 'node:test';
import assert from 'node:assert/strict';
import type { PPKSRecord } from '../types';
import { filterStageOneLinkResponses, STAGE_ONE_FORM_CUTOVER_MS } from './stageOneRespondents';

function record(overrides: Partial<PPKSRecord> = {}): PPKSRecord {
  return {
    id: 'SHEET-RESP-test-1',
    timestamp: '2026-10-27T11:40:15Z',
    namaLengkap: 'Responden Contoh',
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
    googleFormSync: true,
    ...overrides,
  };
}

test('keeps Form submissions made after the stage-one cutover', () => {
  const item = record({ timestamp: '2026-10-27T11:40:15Z' });
  assert.equal(filterStageOneLinkResponses([item]).length, 1);
});

test('excludes existing spreadsheet rows from before the cutover', () => {
  const historical = record({ id: 'old-row', timestamp: '2026-10-27T11:40:13Z' });
  assert.equal(filterStageOneLinkResponses([historical]).length, 0);
});

test('excludes records not marked as imported from a Google Form response source', () => {
  const staffEntry = record({ id: 'staff-entry', googleFormSync: false });
  assert.equal(filterStageOneLinkResponses([staffEntry]).length, 0);
});

test('excludes records without a usable respondent name or timestamp', () => {
  const missingName = record({ namaLengkap: '' });
  const missingTimestamp = record({ timestamp: '' });
  assert.equal(filterStageOneLinkResponses([missingName, missingTimestamp]).length, 0);
});

test('cutover is a stable explicit timestamp rather than a per-device startup time', () => {
  assert.equal(Number.isFinite(STAGE_ONE_FORM_CUTOVER_MS), true);
  assert.equal(STAGE_ONE_FORM_CUTOVER_MS, Date.parse('2026-10-27T11:40:14Z'));
});
