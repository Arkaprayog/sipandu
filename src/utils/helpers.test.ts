import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validatePassword,
  formatPhoneNumberForWhatsApp,
  buildWhatsAppMessage,
  getDesilDescription,
} from './helpers';
import { PPKSRecord } from '../types';

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

