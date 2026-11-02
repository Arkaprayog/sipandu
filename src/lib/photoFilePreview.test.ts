import test from 'node:test';
import assert from 'node:assert/strict';
import { detectPhotoFileFormat, isSupportedPhotoFile } from './photoFilePreview';

test('recognizes the requested PPKS photo and document extensions', () => {
  const extensions: Array<[string, string]> = [
    ['photo.jpg', 'jpeg'], ['photo.jpeg', 'jpeg'], ['photo.png', 'png'],
    ['photo.gif', 'gif'], ['photo.webp', 'webp'], ['photo.bmp', 'bmp'],
    ['photo.tif', 'tiff'], ['photo.tiff', 'tiff'], ['photo.heic', 'heic'],
    ['photo.heif', 'heic'], ['photo.psd', 'psd'], ['photo.cr2', 'raw'],
    ['photo.nef', 'raw'], ['photo.arw', 'raw'], ['photo.dng', 'raw'],
    ['photo.pdf', 'pdf'], ['photo.doc', 'doc'], ['photo.docx', 'docx'],
  ];
  for (const [name, expected] of extensions) {
    assert.equal(detectPhotoFileFormat(name), expected, name);
  }
});

test('recognizes common file signatures when MIME is generic', () => {
  assert.equal(detectPhotoFileFormat('unknown.bin', 'application/octet-stream', new Uint8Array([0xff, 0xd8, 0xff, 0x00])), 'jpeg');
  assert.equal(detectPhotoFileFormat('unknown.bin', 'application/octet-stream', new Uint8Array([0x89, 0x50, 0x4e, 0x47])), 'png');
  assert.equal(detectPhotoFileFormat('unknown.bin', 'application/octet-stream', new Uint8Array([0x42, 0x4d, 0x00, 0x00])), 'bmp');
  assert.equal(detectPhotoFileFormat('unknown.bin', 'application/octet-stream', new Uint8Array([0x25, 0x50, 0x44, 0x46])), 'pdf');
  assert.equal(detectPhotoFileFormat('unknown.bin', 'application/octet-stream', new Uint8Array([0x38, 0x42, 0x50, 0x53])), 'psd');
});

test('rejects arbitrary, empty, and oversized files', () => {
  assert.equal(isSupportedPhotoFile({ name: 'notes.txt', type: 'text/plain', size: 120 }), false);
  assert.equal(isSupportedPhotoFile({ name: 'photo.jpg', type: 'image/jpeg', size: 0 }), false);
  assert.equal(isSupportedPhotoFile({ name: 'photo.jpg', type: 'image/jpeg', size: 31 * 1024 * 1024 }), false);
  assert.equal(isSupportedPhotoFile({ name: 'photo.heic', type: 'application/octet-stream', size: 1024 }), true);
});
