import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildGoogleDriveMultipartBody } from './googleDriveMultipart';

test('builds Google Drive multipart body with real CRLF delimiters', async () => {
  const boundary = 'sipandu-regression-boundary';
  const metadata = JSON.stringify({ name: 'asesmen.pdf' });
  const pdf = new Blob(['%PDF-1.7\\nSIPANDU test'], { type: 'application/pdf' });

  const body = buildGoogleDriveMultipartBody(metadata, 'application/pdf', pdf, boundary);
  const raw = await body.text();

  assert.equal(body.type, `multipart/related; boundary=${boundary}`);
  assert.ok(raw.startsWith(
    `--${boundary}\\r\\nContent-Type: application/json; charset=UTF-8\\r\\n\\r\\n`,
  ));
  assert.ok(raw.includes(
    `\\r\\n--${boundary}\\r\\nContent-Type: application/pdf\\r\\n\\r\\n%PDF-1.7`,
  ));
  assert.ok(raw.endsWith(`\\r\\n--${boundary}--\\r\\n`));
  assert.equal(raw.includes(String.raw`\\r\\n`), false);
  assert.equal(raw.split(`--${boundary}`).length - 1, 3);
});

test('rejects unsafe multipart boundary and content type line breaks', () => {
  const pdf = new Blob(['%PDF'], { type: 'application/pdf' });
  assert.throws(
    () => buildGoogleDriveMultipartBody('{}', 'application/pdf', pdf, 'bad\\r\\nboundary'),
    /Invalid multipart boundary/,
  );
  assert.throws(
    () => buildGoogleDriveMultipartBody('{}', 'application/pdf\\r\\nInjected: yes', pdf, 'safe-boundary'),
    /Invalid multipart content type/,
  );
});
