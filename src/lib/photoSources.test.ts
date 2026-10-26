import test from 'node:test';
import assert from 'node:assert/strict';
import { readPPKSPhotoSourceByKind } from './photoSources';

test('maps each uploaded image to its own photo category from long Google Forms headers', () => {
  const headers = [
    'Nama Lengkap',
    'Unggah foto diri responden tampak dekat (close-up)',
    'Unggah foto KTP responden',
    'Unggah Kartu Keluarga atau foto KK',
    'Unggah foto rumah tampak depan',
  ];
  const row = [
    'Lesmana',
    'https://drive.google.com/file/d/SELFIE_FILE_ID_123456/view',
    'https://drive.google.com/file/d/KTP_FILE_ID_123456789/view',
    'https://drive.google.com/file/d/KK_FILE_ID_12345678901/view',
    'https://drive.google.com/file/d/HOUSE_FILE_ID_123456789/view',
  ];

  assert.equal(readPPKSPhotoSourceByKind(headers, row, 'diri'), row[1]);
  assert.equal(readPPKSPhotoSourceByKind(headers, row, 'ktp'), row[2]);
  assert.equal(readPPKSPhotoSourceByKind(headers, row, 'kk'), row[3]);
  assert.equal(readPPKSPhotoSourceByKind(headers, row, 'rumah'), row[4]);
});

test('does not confuse KTP, KK, or house uploads with respondent portrait', () => {
  const headers = [
    'Upload Foto KTP',
    'Upload Foto KK',
    'Upload Foto Rumah Tampak Depan',
  ];
  const row = ['ktp-link', 'kk-link', 'house-link'];

  assert.equal(readPPKSPhotoSourceByKind(headers, row, 'diri'), '');
  assert.equal(readPPKSPhotoSourceByKind(headers, row, 'ktp'), 'ktp-link');
  assert.equal(readPPKSPhotoSourceByKind(headers, row, 'kk'), 'kk-link');
  assert.equal(readPPKSPhotoSourceByKind(headers, row, 'rumah'), 'house-link');
});

test('returns empty when no matching category upload is available instead of using another photo', () => {
  const headers = ['Unggah foto KK', 'Unggah foto rumah tampak depan'];
  const row = ['kk-link', 'house-link'];
  assert.equal(readPPKSPhotoSourceByKind(headers, row, 'diri'), '');
});
