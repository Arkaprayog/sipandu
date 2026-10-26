import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyPPKSPhotoHeader, normalizePPKSPhotoSource, readPPKSPhotoSourceByKind } from './photoSources';
import { countSharedPhotoFileIds, extractGoogleDriveFileId, googleDriveViewUrl, isGoogleFormLinkedToSpreadsheet, matchFormPhotoResponseForPPKS } from './formPhotoRecovery';

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

test('classifies only explicit Google Forms upload questions into photo categories', () => {
  assert.equal(classifyPPKSPhotoHeader('Unggah foto diri responden close-up'), 'diri');
  assert.equal(classifyPPKSPhotoHeader('Unggah foto KTP responden'), 'ktp');
  assert.equal(classifyPPKSPhotoHeader('Unggah foto KK'), 'kk');
  assert.equal(classifyPPKSPhotoHeader('Unggah foto rumah tampak depan'), 'rumah');
  assert.equal(classifyPPKSPhotoHeader('Unggah berkas'), null);
});

test('recovers only a response matching PPKS name and close timestamp', () => {
  const candidates = [
    {
      responseId: 'response-a',
      timestamp: '2026-10-26T08:00:20',
      respondentName: 'Lesmana',
      photos: { diri: 'https://drive.google.com/file/d/AAAAAAAAAAAAAAA111/view' },
    },
    {
      responseId: 'response-b',
      timestamp: '2026-10-26T08:00:25',
      respondentName: 'Tukinem',
      photos: { diri: 'https://drive.google.com/file/d/BBBBBBBBBBBBBBB222/view' },
    },
  ];
  assert.equal(
    matchFormPhotoResponseForPPKS('LES MANA', '2026-10-26T08:00:00', candidates)?.responseId,
    'response-a'
  );
  assert.equal(
    matchFormPhotoResponseForPPKS('Nama berbeda', '2026-10-26T08:00:00', candidates),
    null
  );
});

test('does not assign ambiguous timestamp ties to a respondent', () => {
  const candidates = [
    { responseId: 'a', timestamp: '2026-10-26T08:00:00', photos: { ktp: 'ktp-a' } },
    { responseId: 'b', timestamp: '2026-10-26T08:00:00', photos: { ktp: 'ktp-b' } },
  ];
  assert.equal(
    matchFormPhotoResponseForPPKS('Lesmana', '2026-10-26T08:00:00', candidates),
    null
  );
});

test('builds a valid Drive view URL only for plausible file IDs', () => {
  assert.equal(googleDriveViewUrl('Abcdefghijklmnop12345'), 'https://drive.google.com/file/d/Abcdefghijklmnop12345/view');
  assert.equal(googleDriveViewUrl('bad id'), '');
});

test('normalizes real photo URLs and file IDs while rejecting bare filenames', () => {
  assert.equal(
    normalizePPKSPhotoSource('https://drive.google.com/open?id=Abcdefghijklmnop12345'),
    'https://drive.google.com/open?id=Abcdefghijklmnop12345'
  );
  assert.equal(
    normalizePPKSPhotoSource('Abcdefghijklmnop12345'),
    'https://drive.google.com/file/d/Abcdefghijklmnop12345/view'
  );
  assert.equal(normalizePPKSPhotoSource('IMG_20261026.jpg'), '');
  assert.equal(normalizePPKSPhotoSource(''), '');
});

test('matches the correct Google Forms upload by NIK even when timestamps use different zones', () => {
  const candidates = [
    {
      responseId: 'response-correct',
      timestamp: '2026-10-26T01:00:20Z',
      respondentName: 'Nama pada Form berbeda format',
      respondentNIK: '1271011505920003',
      photos: { diri: 'https://drive.google.com/file/d/AAAAAAAAAAAAAAA111/view' },
    },
    {
      responseId: 'response-other',
      timestamp: '2026-10-26T08:00:20',
      respondentName: 'Abdul Rasid Mendrofa',
      respondentNIK: '1271011505920004',
      photos: { diri: 'https://drive.google.com/file/d/BBBBBBBBBBBBBBB222/view' },
    },
  ];

  assert.equal(
    matchFormPhotoResponseForPPKS(
      'Abdul Rasid Mendrofa',
      '26/10/2026 08:00:00',
      candidates,
      3 * 60 * 1000,
      '1271011505920003',
    )?.responseId,
    'response-correct'
  );
});

test('never uses a conflicting NIK as a name/timestamp fallback', () => {
  const candidates = [{
    responseId: 'wrong-nik',
    timestamp: '2026-10-26T08:00:00',
    respondentName: 'Lesmana',
    respondentNIK: '1271011505920004',
    photos: { diri: 'https://drive.google.com/file/d/AAAAAAAAAAAAAAA111/view' },
  }];

  assert.equal(
    matchFormPhotoResponseForPPKS(
      'Lesmana',
      '2026-10-26T08:00:00',
      candidates,
      3 * 60 * 1000,
      '1271011505920003',
    ),
    null
  );
});

test('links the Form only when linkedSheetId exactly matches the source spreadsheet', () => {
  assert.equal(isGoogleFormLinkedToSpreadsheet('sheet-response-123', 'sheet-response-123'), true);
  assert.equal(isGoogleFormLinkedToSpreadsheet('another-sheet-456', 'sheet-response-123'), false);
  assert.equal(isGoogleFormLinkedToSpreadsheet('', 'sheet-response-123'), false);
  assert.equal(isGoogleFormLinkedToSpreadsheet(undefined, 'sheet-response-123'), false);
});

test('matches Google Forms photo response by normalized Indonesian HP/WA when NIK is absent', () => {
  const candidates = [
    {
      responseId: 'same-phone',
      timestamp: '2026-10-26T06:00:00Z',
      respondentName: 'Nama beda ejaan',
      respondentPhone: '+62 812-3456-7890',
      photos: { diri: 'https://drive.google.com/file/d/AAAAAAAAAAAAAAA111/view' },
    },
    {
      responseId: 'wrong-phone',
      timestamp: '2026-10-26T06:00:00Z',
      respondentName: 'Lesmana',
      respondentPhone: '081299999999',
      photos: { diri: 'https://drive.google.com/file/d/BBBBBBBBBBBBBBB222/view' },
    },
  ];
  assert.equal(
    matchFormPhotoResponseForPPKS(
      'Lesmana',
      '26/10/2026 13:00:00',
      candidates,
      3 * 60 * 1000,
      '',
      '0812 3456 7890',
    )?.responseId,
    'same-phone'
  );
});

test('uses existing Drive file IDs to anchor a source row to its exact Form response', () => {
  const source = {
    diri: 'https://drive.google.com/open?id=AAAAAAAAAAAAAAA111',
    ktp: 'https://drive.google.com/file/d/BBBBBBBBBBBBBBB222/view',
  };
  const candidate = {
    diri: 'https://drive.google.com/file/d/AAAAAAAAAAAAAAA111/view',
    ktp: 'https://drive.google.com/open?id=BBBBBBBBBBBBBBB222',
  };
  assert.equal(extractGoogleDriveFileId(source.diri), 'AAAAAAAAAAAAAAA111');
  assert.equal(countSharedPhotoFileIds(source, candidate), 2);
  assert.equal(countSharedPhotoFileIds(source, { diri: 'https://drive.google.com/file/d/CCCCCCCCCCCCCCC333/view' }), 0);
});
