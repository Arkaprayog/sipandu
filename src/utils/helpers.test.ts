import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validatePassword,
  formatPhoneNumberForWhatsApp,
  buildWhatsAppMessage,
  getDesilDescription,
  authenticateFixedUser,
} from './helpers';
import { PPKSRecord, UserAccount } from '../types';

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

test('authenticateFixedUser authenticates fixed user 1 (Deny) and user 2 (Supriyanto)', () => {
  const accounts: UserAccount[] = [
    {
      id: 'user-001',
      username: 'deny',
      displayName: 'Deny Arifin Martyon S.',
      password: 'kemensos123',
      nip: '19920315 202012 1 002',
      unitKerja: 'Kemensos',
      jabatan: 'Pendamping',
      noHp: '081260887722',
      photoUrl: '',
      role: 'Pendamping',
    },
    {
      id: 'user-002',
      username: 'supriyanto',
      displayName: 'Drs. Supriyanto, M.Si',
      password: 'kemensos456',
      nip: '19680712 199303 1 001',
      unitKerja: 'Kemensos',
      jabatan: 'Kasubdit',
      noHp: '081188992233',
      photoUrl: '',
      role: 'Supervisor / Kasubdit',
    },
  ];

  // User 1 login with username
  const auth1 = authenticateFixedUser('deny', 'kemensos123', accounts);
  assert.equal(auth1.success, true);
  assert.equal(auth1.account?.displayName, 'Deny Arifin Martyon S.');

  // User 2 login with display name
  const auth2 = authenticateFixedUser('Drs. Supriyanto, M.Si', 'kemensos456', accounts);
  assert.equal(auth2.success, true);
  assert.equal(auth2.account?.username, 'supriyanto');

  // Wrong password test
  const authWrong = authenticateFixedUser('deny', 'salah123', accounts);
  assert.equal(authWrong.success, false);
  assert.match(authWrong.error || '', /Password salah/);
});

