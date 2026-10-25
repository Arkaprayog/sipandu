import test from 'node:test';
import assert from 'node:assert/strict';
import { PPKSRecord } from '../types';
import { buildWhatsAppMessage } from './helpers';

const respondent: PPKSRecord = {
  id: 'PPKS-REAL-001',
  timestamp: '2026-10-25T10:00:00',
  namaLengkap: 'Responden Aktual',
  nik: '1271011505920003',
  usia: 34,
  jenisKelamin: 'Laki-laki',
  kotaDomisili: 'Medan',
  alamatLengkap: '',
  noHpWa: '',
  jenisBantuan: '',
  intervensiMental: '',
  desil: 0,
  fotoDiri: '',
  fotoKtp: '',
  statusAsesmen: 'Tahap Awal',
};

test('WhatsApp message never invents Google Form links or claims automatic verification', () => {
  const message = buildWhatsAppMessage(respondent);
  assert.equal(message.includes('forms.gle/SIPANDU-ODHIV-Lanjutan-Sumut'), false);
  assert.equal(message.includes('forms.gle/Asesmen-Kesehatan-Mental-ODHIV-Kemensos'), false);
  assert.match(message, /Tautan asesmen lanjutan belum dikonfigurasi/);
  assert.doesNotMatch(message, /Data Anda telah berhasil kami terima dan terverifikasi/);
});

test('converts a configured Google Forms editor URL to its public respondent URL', () => {
  const message = buildWhatsAppMessage(respondent, {
    googleFormTahapAwalUrl: 'https://docs.google.com/forms/d/FORM_ID/edit',
    googleFormKesehatanMentalUrl: 'https://docs.google.com/forms/d/MENTAL_ID/viewform',
  });
  assert.match(message, /https:\/\/docs\.google\.com\/forms\/d\/FORM_ID\/viewform/);
  assert.match(message, /https:\/\/docs\.google\.com\/forms\/d\/MENTAL_ID\/viewform/);
});
