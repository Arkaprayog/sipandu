import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validatePassword,
  formatPhoneNumberForWhatsApp,
  buildGoogleFormsPrefilledUrl,
  buildWhatsAppMessage,
  getDesilDescription,
  toGoogleFormsRespondentUrl,
} from './helpers';
import { PPKSRecord } from '../types';

test('stage-one Google Form editor URL is normalized to the respondent-facing viewform URL', () => {
  assert.equal(
    toGoogleFormsRespondentUrl('https://docs.google.com/forms/d/FORM-NEW-123/edit'),
    'https://docs.google.com/forms/d/FORM-NEW-123/viewform'
  );
  assert.equal(
    toGoogleFormsRespondentUrl('https://forms.gle/AbCdEf123'),
    'https://forms.gle/AbCdEf123'
  );
});

test('follow-up WhatsApp Form URL is prefilled with the exact respondent PPKS ID', () => {
  const url = buildGoogleFormsPrefilledUrl(
    'https://docs.google.com/forms/d/FOLLOW-UP-123/edit',
    '987654321',
    'SIPANDU-RESP-456'
  );
  const parsed = new URL(url);
  assert.equal(parsed.pathname, '/forms/d/FOLLOW-UP-123/viewform');
  assert.equal(parsed.searchParams.get('entry.987654321'), 'SIPANDU-RESP-456');
  assert.equal(parsed.searchParams.get('usp'), 'pp_url');
});

test('validatePassword rejects passwords under 6 characters', () => {
  const result = validatePassword('abc1');
  assert.equal(result.valid, false);
  assert.match(result.error || '', /minimal 6 karakter/);
});

test('validatePassword rejects passwords without numbers', () => {
  const result = validatePassword('abcdefgh');
  assert.equal(result.valid, false);
  assert.match(result.error || '', /kombinasi angka/);
});

test('validatePassword accepts valid password with numbers and >= 6 characters', () => {
  const result = validatePassword('admin123');
  assert.equal(result.valid, true);
  assert.equal(result.error, undefined);
});

test('formatPhoneNumberForWhatsApp converts local Indonesian numbers correctly', () => {
  assert.equal(formatPhoneNumberForWhatsApp('081234567890'), '6281234567890');
  assert.equal(formatPhoneNumberForWhatsApp('6281234567890'), '6281234567890');
  assert.equal(formatPhoneNumberForWhatsApp('+62 812-3456-7890'), '6281234567890');
});

test('buildWhatsAppMessage includes respondent name and official Kemensos template text', () => {
  const mockPpks: PPKSRecord = {
    id: 'PPKS-SU-001',
    timestamp: '2026-10-24 10:00:00',
    namaLengkap: 'Budi Santoso',
    nik: '1271011505920003',
    usia: 34,
    jenisKelamin: 'Laki-laki',
    kotaDomisili: 'Kota Medan',
    alamatLengkap: 'Jl. STM No. 45, Medan Amplas',
    noHpWa: '081234567890',
    jenisBantuan: 'Bantuan Nutrisi & Modal Usaha',
    intervensiMental: 'Konseling penerimaan diri & kepatuhan ARV',
    desil: 2,
    fotoDiri: '',
    fotoKtp: '',
    statusAsesmen: 'Tahap Awal',
  };

  const message = buildWhatsAppMessage(mockPpks);
  assert.match(message, /Halo Budi Santoso/);
  assert.match(message, /Saya Deny Arifin Martyon dari Tim Administrasi/);
  assert.match(message, /Program Atensi Kementerian Sosial Tahap Awal/);
  assert.match(message, /Deny Arifin Martyon S\./);
  assert.match(message, /Direktorat Rehabilitasi Sosial Korban Penyalahgunaan Narkoba & ODHIV/);
});

test('getDesilDescription formats desil labels correctly', () => {
  assert.match(getDesilDescription(1), /Desil 1: Sangat Miskin/);
  assert.match(getDesilDescription(0), /Belum Terdaftar/);
});

