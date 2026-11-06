import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildGoogleDriveMultipartBody, buildGoogleDriveRequestUrl } from './googleDriveMultipart';

test('builds Google Drive multipart body with real CRLF delimiters', async () => {
  const boundary = 'sipandu-regression-boundary';
  const metadata = JSON.stringify({ name: 'asesmen.pdf' });
  const pdf = new Blob(['%PDF-1.7\nSIPANDU test'], { type: 'application/pdf' });

  const body = buildGoogleDriveMultipartBody(metadata, 'application/pdf', pdf, boundary);
  const raw = await body.text();

  assert.equal(body.type, `multipart/related; boundary=${boundary}`);
  assert.ok(raw.startsWith(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
  ));
  assert.ok(raw.includes(
    `\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.7`,
  ));
  assert.ok(raw.endsWith(`\r\n--${boundary}--\r\n`));
  assert.equal(raw.includes(String.raw`\r\n`), false);
  assert.equal(raw.split(`--${boundary}`).length - 1, 3);
});

test('rejects unsafe multipart boundary and content type line breaks', () => {
  const pdf = new Blob(['%PDF'], { type: 'application/pdf' });
  assert.throws(
    () => buildGoogleDriveMultipartBody('{}', 'application/pdf', pdf, 'bad\r\nboundary'),
    /Invalid multipart boundary/,
  );
  assert.throws(
    () => buildGoogleDriveMultipartBody('{}', 'application/pdf\r\nInjected: yes', pdf, 'safe-boundary'),
    /Invalid multipart content type/,
  );
});


test('uses the regular Drive v3 endpoint for folder and metadata requests', () => {
  assert.equal(
    buildGoogleDriveRequestUrl('/files?q=mimeType%3Dfolder'),
    'https://www.googleapis.com/drive/v3/files?q=mimeType%3Dfolder',
  );
});

test('uses the dedicated Drive upload endpoint for multipart and resumable uploads', () => {
  assert.equal(
    buildGoogleDriveRequestUrl('/files?uploadType=multipart&fields=id', true),
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
  );
  assert.equal(
    buildGoogleDriveRequestUrl('/files?uploadType=resumable&fields=id', true),
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id',
  );
});

test('rejects non-rooted and protocol-relative Drive API paths', () => {
  assert.throws(() => buildGoogleDriveRequestUrl('files'), /Invalid Google Drive API path/);
  assert.throws(() => buildGoogleDriveRequestUrl('//attacker.example/files'), /Invalid Google Drive API path/);
});
