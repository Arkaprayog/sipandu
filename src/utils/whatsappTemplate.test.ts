import test from 'node:test';
import assert from 'node:assert/strict';
import { PPKSRecord } from '../types';
import {
  buildGoogleFormsPrefilledUrl,
  buildWhatsAppMessage,
  toGoogleFormsRespondentUrl,
} from './helpers';

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

test('WhatsApp message does not invent a continuation link when stage-two config is missing', () => {
  const message = buildWhatsAppMessage(respondent, {
    googleFormTahapLanjutanUrl: '',
    googleFormTahapLanjutanIdEntry: '',
  });
  assert.match(message, /Tautan asesmen lanjutan belum dapat dibuat/);
  assert.doesNotMatch(message, /forms\.gle\/SIPANDU-ODHIV-Lanjutan-Sumut/);
  assert.doesNotMatch(message, /Data Anda telah berhasil kami terima dan terverifikasi/);
});

test('stage-two WhatsApp message contains a unique prefilled URL for the exact PPKS ID', () => {
  const message = buildWhatsAppMessage(respondent, {
    googleFormTahapLanjutanUrl: 'https://docs.google.com/forms/d/FORM_LANJUTAN/edit',
    googleFormTahapLanjutanIdEntry: '123456789',
    googleFormKesehatanMentalUrl: 'https://docs.google.com/forms/d/MENTAL_ID/edit',
  });
  assert.match(message, /ID referensi PPKS: PPKS-REAL-001/);
  assert.match(message, /https:\/\/docs\.google\.com\/forms\/d\/FORM_LANJUTAN\/viewform\?usp=pp_url&entry\.123456789=PPKS-REAL-001/);
  assert.match(message, /https:\/\/docs\.google\.com\/forms\/d\/MENTAL_ID\/viewform/);
});

test('prefill URL normalizes editor URLs and carries the unique respondent identifier', () => {
  const link = buildGoogleFormsPrefilledUrl(
    'https://docs.google.com/forms/d/FORM_ID/edit?usp=sharing',
    'entry.555001',
    respondent.id
  );
  const url = new URL(link);
  assert.equal(url.pathname, '/forms/d/FORM_ID/viewform');
  assert.equal(url.searchParams.get('entry.555001'), respondent.id);
  assert.equal(url.searchParams.get('usp'), 'pp_url');
});

test('respondent links never expose a Google Forms editor URL', () => {
  assert.equal(
    toGoogleFormsRespondentUrl('https://docs.google.com/forms/d/FORM_ID/edit'),
    'https://docs.google.com/forms/d/FORM_ID/viewform'
  );
  assert.equal(
    toGoogleFormsRespondentUrl('https://forms.gle/AbCdEf123'),
    'https://forms.gle/AbCdEf123'
  );
});

test('unique prefill rejects short links and invalid entry identifiers instead of guessing', () => {
  assert.throws(
    () => buildGoogleFormsPrefilledUrl('https://forms.gle/AbCdEf123', '123456', respondent.id),
    /URL Google Forms lengkap/
  );
  assert.throws(
    () => buildGoogleFormsPrefilledUrl('https://docs.google.com/forms/d/FORM_ID/edit', 'ID PPKS', respondent.id),
    /ID entry/
  );
});
