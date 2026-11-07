import test from 'node:test';
import assert from 'node:assert/strict';
import { stripPhotoPayloadsFromLocalCache } from './localCacheSanitizer';

test('removes data URL and blob photo payloads recursively before local cache writes', () => {
  const input = {
    id: 'respondent-1',
    fotoDiri: 'data:image/jpeg;base64,large-photo',
    fotoKtp: 'data:application/pdf;base64,private-document',
    fotoKk: 'blob:https://sipandu.example/temporary-file',
    profile: { avatar: 'data:image/png;base64,profile-photo' },
    tags: ['safe-value', 'data:image/webp;base64,photo'],
  };
  assert.deepEqual(stripPhotoPayloadsFromLocalCache(input), {
    id: 'respondent-1',
    fotoDiri: '',
    fotoKtp: '',
    fotoKk: '',
    profile: { avatar: '' },
    tags: ['safe-value', ''],
  });
});

test('preserves ordinary Drive links, respondent fields and primitive values', () => {
  const input = {
    namaLengkap: 'Responden Contoh',
    fotoDiri: 'https://drive.google.com/file/d/drive-id/view',
    age: 29,
    active: true,
    empty: null,
  };
  assert.deepEqual(stripPhotoPayloadsFromLocalCache(input), input);
});
