import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGoogleFormUtamaPrefilledUrl } from './helpers';
import type { GoogleFormUtamaPrefillEntries, PPKSRecord } from '../types';

const record: PPKSRecord = {
  id: 'PPKS-SU-TEST-001',
  timestamp: '2026-10-29T08:00:00.000Z',
  namaLengkap: 'Responden Uji',
  nik: '1271000000000001',
  usia: 34,
  jenisKelamin: 'Perempuan',
  kotaDomisili: 'Kota Medan',
  alamatLengkap: '',
  noHpWa: '081234567890',
  jenisBantuan: 'Bantuan nutrisi',
  intervensiMental: '',
  desil: 0,
  fotoDiri: '',
  fotoKtp: '',
  statusAsesmen: 'Tahap Awal',
};
const entries: GoogleFormUtamaPrefillEntries = {
  namaLengkap: '101',
  nik: '102',
  usia: '103',
  jenisKelamin: '104',
  kotaDomisili: '105',
  noHpWa: '106',
  jenisBantuan: '108',
  idPpks: '107',
};

test('prefills configured primary Google Form fields from stage-one data', () => {
  const url = new URL(buildGoogleFormUtamaPrefilledUrl('https://docs.google.com/forms/d/FORM_ID/edit', entries, record));
  assert.equal(url.pathname, '/forms/d/FORM_ID/viewform');
  assert.equal(url.searchParams.get('entry.101'), record.namaLengkap);
  assert.equal(url.searchParams.get('entry.102'), record.nik);
  assert.equal(url.searchParams.get('entry.103'), '34');
  assert.equal(url.searchParams.get('entry.104'), 'Perempuan');
  assert.equal(url.searchParams.get('entry.105'), 'Kota Medan');
  assert.equal(url.searchParams.get('entry.106'), '081234567890');
  assert.equal(url.searchParams.get('entry.108'), 'Bantuan nutrisi');
  assert.equal(url.searchParams.get('entry.107'), record.id);
});

test('refuses to invent a Google Form ID entry', () => {
  assert.throws(
    () => buildGoogleFormUtamaPrefilledUrl('https://docs.google.com/forms/d/FORM_ID/viewform',
      { namaLengkap: '', nik: '', usia: '', jenisKelamin: '', kotaDomisili: '', noHpWa: '', jenisBantuan: '', idPpks: '' }, record),
    /Entry ID pertanyaan “ID PPKS” belum diatur/
  );
});

test('requires at least one identity field in addition to ID PPKS', () => {
  assert.throws(
    () => buildGoogleFormUtamaPrefilledUrl('https://docs.google.com/forms/d/FORM_ID/viewform',
      { namaLengkap: '', nik: '', usia: '', jenisKelamin: '', kotaDomisili: '', noHpWa: '', jenisBantuan: '', idPpks: '107' }, record),
    /Entry ID untuk setidaknya satu pertanyaan identitas/
  );
});
