import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import worker from './index';

const originalFetch = globalThis.fetch;

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('archives a PDF only after Firebase and Google identity checks and Drive read-back verification', async () => {
  const createdFolderIds: string[] = [];
  const fileId = 'drive-file-verified';
  const archiveKey = Array.from(new Uint8Array(await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode('sipandu-integrated-assessment:ppks-internal-001'),
  )), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const pdf = new Blob(['%PDF-1.7\nSIPANDU synthetic test PDF'], { type: 'application/pdf' });
  const savedFileRef: { current: Record<string, unknown> | null } = { current: null };

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method || 'GET';

    if (url.includes('identitytoolkit.googleapis.com')) {
      return jsonResponse({
        users: [{ localId: 'staff-uid', email: 'staff@example.test', customAttributes: JSON.stringify({ role: 'owner' }) }],
      });
    }
    if (url.includes('oauth2/v3/userinfo')) {
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer google-access-token');
      return jsonResponse({ email: 'aryprayoga139@gmail.com', email_verified: true });
    }
    if (url.includes('www.googleapis.com/drive/v3/files')) {
      const parsed = new URL(url);
      if (parsed.searchParams.has('q')) return jsonResponse({ files: [] });

      if (parsed.searchParams.get('uploadType') === 'multipart' && method === 'POST') {
        const multipart = await (init?.body as Blob).text();
        assert.ok(multipart.includes('\r\nContent-Type: application/json; charset=UTF-8\r\n'));
        assert.ok(multipart.includes('\r\nContent-Type: application/pdf\r\n'));
        savedFileRef.current = {
          id: fileId,
          name: 'Form-Asesmen-Terintegrasi-' + archiveKey.slice(0, 20) + '.pdf',
          mimeType: 'application/pdf',
          size: String(pdf.size),
          webViewLink: 'https://drive.google.com/open?id=' + fileId,
          parents: [createdFolderIds[2]],
          appProperties: { sipanduManaged: 'true', sipanduArchiveKey: archiveKey },
          trashed: false,
        };
        return jsonResponse(savedFileRef.current);
      }

      if (parsed.searchParams.get('fields') === 'id' && method === 'POST') {
        const id = 'folder-' + (createdFolderIds.length + 1);
        createdFolderIds.push(id);
        return jsonResponse({ id });
      }

      if (parsed.pathname.endsWith('/' + fileId)) return jsonResponse(savedFileRef.current);
    }
    throw new Error('Unexpected mocked request: ' + method + ' ' + url);
  };

  const form = new FormData();
  form.set('ppksId', 'ppks-internal-001');
  form.set('file', pdf, 'synthetic.pdf');
  const request = new Request('https://sipandu-assessment-archive.aryprayoga139.workers.dev/archive', {
    method: 'POST',
    headers: {
      Origin: 'https://sipanduodhiv.my.id',
      Authorization: 'Bearer firebase-id-token',
      'X-Google-Access-Token': 'google-access-token',
    },
    body: form,
  });

  const response = await worker.fetch(request, {
    FIREBASE_PROJECT_ID: 'gen-lang-client-0197631978',
    FIREBASE_AUTH_API_KEY: 'public-firebase-api-key',
    GOOGLE_WORKSPACE_EMAIL: 'aryprayoga139@gmail.com',
  });
  const result = await response.json() as Record<string, unknown>;

  assert.equal(response.status, 200, JSON.stringify(result));
  assert.equal(result.ok, true);
  assert.equal(result.verified, true);
  assert.equal(result.fileId, fileId);
  assert.equal(result.mimeType, 'application/pdf');
  assert.equal(result.size, pdf.size);
  assert.equal(createdFolderIds.length, 3);
  const savedFile = savedFileRef.current;
  assert.ok(savedFile);
  assert.equal(String(savedFile.name).includes('ppks-internal-001'), false);
});

test('rejects requests from an unapproved web origin', async () => {
  const request = new Request('https://sipandu-assessment-archive.aryprayoga139.workers.dev/archive', {
    method: 'POST',
    headers: { Origin: 'https://malicious.example' },
  });
  const response = await worker.fetch(request, {});
  assert.equal(response.status, 403);
});


test('stores a staff document in private Drive, verifies the bytes, and enforces owner access', async () => {
  const fileId = 'drive-doc-file-001';
  const bytes = new TextEncoder().encode('synthetic staff document');
  const folderIds: string[] = [];
  let documentRecord: Record<string, unknown> | null = null;
  let mediaReadCount = 0;

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method || 'GET';

    if (url.hostname === 'identitytoolkit.googleapis.com') {
      const body = JSON.parse(String(init?.body || '{}')) as { idToken?: string };
      return jsonResponse({
        users: [{
          localId: body.idToken === 'other-firebase-token' ? 'other-uid' : 'staff-uid',
          email: 'staff@example.test',
          customAttributes: JSON.stringify({ role: 'pendamping' }),
        }],
      });
    }
    if (url.hostname === 'www.googleapis.com' && url.pathname === '/oauth2/v3/userinfo') {
      return jsonResponse({ email: 'aryprayoga139@gmail.com', email_verified: true });
    }
    if (url.hostname === 'www.googleapis.com' && url.pathname.startsWith('/drive/v3/files')) {
      if (url.searchParams.has('q')) return jsonResponse({ files: [] });

      if (url.searchParams.get('fields') === 'id' && method === 'POST') {
        const id = 'document-folder-' + (folderIds.length + 1);
        folderIds.push(id);
        return jsonResponse({ id });
      }

      if (url.searchParams.has('uploadType') && method === 'POST') {
        const body = await (init?.body as Blob).text();
        assert.ok(body.includes('sipanduDocument'));
        assert.ok(body.includes('sipanduOwnerUid'));
        assert.ok(body.includes('application/pdf'));
        documentRecord = {
          id: fileId,
          name: 'scan.pdf',
          mimeType: 'application/pdf',
          size: String(bytes.byteLength),
          webViewLink: 'https://drive.google.com/open?id=' + fileId,
          parents: [folderIds[2]],
          appProperties: {
            sipanduManaged: 'true',
            sipanduDocument: 'true',
            sipanduOwnerUid: 'staff-uid',
            sipanduCategory: 'surat-tugas',
          },
          trashed: false,
        };
        return jsonResponse(documentRecord);
      }

      if (url.pathname.endsWith('/' + fileId) && url.searchParams.get('alt') === 'media') {
        mediaReadCount += 1;
        return new Response(bytes, { headers: { 'Content-Type': 'application/pdf' } });
      }
      if (url.pathname.endsWith('/' + fileId)) return jsonResponse(documentRecord);
    }
    throw new Error('Unexpected mocked request: ' + method + ' ' + url);
  };

  const env = {
    FIREBASE_PROJECT_ID: 'gen-lang-client-0197631978',
    FIREBASE_AUTH_API_KEY: 'public-firebase-api-key',
    GOOGLE_WORKSPACE_EMAIL: 'aryprayoga139@gmail.com',
  };
  const origin = 'https://sipanduodhiv.my.id';
  const form = new FormData();
  form.set('category', 'surat-tugas');
  form.set('file', new File([bytes], 'scan.pdf', { type: 'application/pdf' }), 'scan.pdf');
  const uploadRequest = new Request('https://sipandu-assessment-archive.aryprayoga139.workers.dev/documents', {
    method: 'POST',
    headers: {
      Origin: origin,
      Authorization: 'Bearer staff-firebase-token',
      'X-Google-Access-Token': 'google-access-token',
    },
    body: form,
  });
  const uploadResponse = await worker.fetch(uploadRequest, env);
  const uploaded = await uploadResponse.json() as Record<string, unknown>;
  assert.equal(uploadResponse.status, 200, JSON.stringify(uploaded));
  assert.equal(uploaded.verified, true);
  assert.equal(uploaded.fileId, fileId);
  assert.equal(uploaded.size, bytes.byteLength);
  assert.equal(folderIds.length, 3);

  const downloadRequest = new Request('https://sipandu-assessment-archive.aryprayoga139.workers.dev/documents/' + fileId, {
    headers: {
      Origin: origin,
      Authorization: 'Bearer staff-firebase-token',
      'X-Google-Access-Token': 'google-access-token',
    },
  });
  const downloadResponse = await worker.fetch(downloadRequest, env);
  assert.equal(downloadResponse.status, 200);
  assert.equal(downloadResponse.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(downloadResponse.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.deepEqual(new Uint8Array(await downloadResponse.arrayBuffer()), bytes);
  assert.equal(mediaReadCount, 1);

  const foreignRequest = new Request('https://sipandu-assessment-archive.aryprayoga139.workers.dev/documents/' + fileId, {
    headers: {
      Origin: origin,
      Authorization: 'Bearer other-firebase-token',
      'X-Google-Access-Token': 'google-access-token',
    },
  });
  const foreignResponse = await worker.fetch(foreignRequest, env);
  assert.equal(foreignResponse.status, 403);
  assert.equal(mediaReadCount, 1, 'a different pendamping must not receive the file bytes');
});
