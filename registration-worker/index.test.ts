import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker, { missingActivationConfiguration, parseJson } from './index.runtime.js';

function streamedJsonRequest(value: string): Request {
  const bytes = new TextEncoder().encode(value);
  const chunks = [bytes.slice(0, 4096), bytes.slice(4096, 8192), bytes.slice(8192)];
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) controller.enqueue(chunks[index++]);
      else controller.close();
    },
  });
  return new Request('https://sipandu-registration.test/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    duplex: 'half',
  } as RequestInit);
}

test('accepts valid JSON without Content-Length', async () => {
  const request = streamedJsonRequest(JSON.stringify({ code: 'team-code', email: 'member@example.test' }));
  assert.equal(request.headers.has('content-length'), false);
  assert.deepEqual(await parseJson(request), { code: 'team-code', email: 'member@example.test' });
});

test('rejects oversized streamed JSON without Content-Length', async () => {
  const request = streamedJsonRequest(JSON.stringify({ payload: 'x'.repeat(12_100) }));
  assert.equal(request.headers.has('content-length'), false);
  assert.equal(await parseJson(request), null);
});

test('rejects non-JSON content types', async () => {
  const request = new Request('https://sipandu-registration.test/register', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: '{"code":"team-code"}',
  });
  assert.equal(await parseJson(request), null);
});

test('rejects malformed JSON and non-object JSON values', async () => {
  const malformed = new Request('https://sipandu-registration.test/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"code":',
  });
  const array = new Request('https://sipandu-registration.test/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '[]',
  });
  assert.equal(await parseJson(malformed), null);
  assert.equal(await parseJson(array), null);
});


test('activation does not require the shared signup code once a pending invitation exists', () => {
  const env = {
    FIREBASE_WEB_API_KEY: 'public-web-api-key',
    FIREBASE_PROJECT_ID: 'gen-lang-client-0197631978',
    FIREBASE_SERVICE_ACCOUNT_JSON: '{"project_id":"gen-lang-client-0197631978"}',
    PENDING_REGISTRATIONS: {
      get: async () => null,
      put: async () => undefined,
      delete: async () => undefined,
    },
  };
  assert.deepEqual(missingActivationConfiguration(env), []);
});

test('activation reports missing Firebase service-account configuration', () => {
  const env = {
    FIREBASE_WEB_API_KEY: 'public-web-api-key',
    FIREBASE_PROJECT_ID: 'gen-lang-client-0197631978',
    PENDING_REGISTRATIONS: {
      get: async () => null,
      put: async () => undefined,
      delete: async () => undefined,
    },
  };
  assert.deepEqual(missingActivationConfiguration(env), ['FIREBASE_SERVICE_ACCOUNT_JSON']);
});


test('allows the configured SIPANDU custom domain to call registration endpoints', async () => {
  const origin = 'https://sipanduodhiv.my.id';
  const response = await worker.fetch(new Request('https://sipandu-registration.test/activate', {
    method: 'OPTIONS',
    headers: { Origin: origin },
  }), {});
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
});

test('rejects untrusted origins at the registration Worker boundary', async () => {
  const response = await worker.fetch(new Request('https://sipandu-registration.test/activate', {
    method: 'OPTIONS',
    headers: { Origin: 'https://untrusted.example' },
  }), {});
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
});


test('restores an invitation for the same verified Firebase account without creating a new account', async () => {
  const originalFetch = globalThis.fetch;
  const writes: Array<{ key: string; value: string; expirationTtl?: number }> = [];
  const kv = {
    get: async (_key: string) => null,
    put: async (key: string, value: string, options?: { expirationTtl?: number }) => {
      writes.push({ key, value, expirationTtl: options?.expirationTtl });
    },
    delete: async (_key: string) => undefined,
  };
  globalThis.fetch = (async () => new Response(JSON.stringify({
    users: [{
      localId: 'firebase-uid-existing-123',
      email: 'AryPrayoga139@gmail.com',
      emailVerified: true,
      customAttributes: '{}',
    }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;

  try {
    const response = await worker.fetch(new Request('https://sipandu-registration.test/restore-invitation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer existing-firebase-id-token',
        'CF-Connecting-IP': '192.0.2.80',
      },
      body: JSON.stringify({ code: 'team-recovery-code-0123456789' }),
    }), {
      TEAM_REGISTRATION_CODE: 'team-recovery-code-0123456789',
      FIREBASE_WEB_API_KEY: 'test-web-api-key',
      FIREBASE_PROJECT_ID: 'gen-lang-client-0197631978',
      FIREBASE_SERVICE_ACCOUNT_JSON: '{"project_id":"gen-lang-client-0197631978","client_email":"test@example.iam.gserviceaccount.com","private_key":"test"}',
      PENDING_REGISTRATIONS: kv,
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      message: 'Undangan tim berhasil dipulihkan untuk akun dan email yang sama. Lanjutkan aktivasi.',
    });
    const invitation = writes.find((entry) => entry.key === 'pending:firebase-uid-existing-123');
    assert.ok(invitation);
    assert.equal(invitation.expirationTtl, 7 * 24 * 60 * 60);
    assert.deepEqual(JSON.parse(invitation.value), {
      uid: 'firebase-uid-existing-123',
      email: 'aryprayoga139@gmail.com',
      createdAt: JSON.parse(invitation.value).createdAt,
      restoredAt: JSON.parse(invitation.value).restoredAt,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('does not restore an invitation before Firebase email verification', async () => {
  const originalFetch = globalThis.fetch;
  const writes: string[] = [];
  const kv = {
    get: async (_key: string) => null,
    put: async (key: string) => { writes.push(key); },
    delete: async (_key: string) => undefined,
  };
  globalThis.fetch = (async () => new Response(JSON.stringify({
    users: [{
      localId: 'firebase-uid-unverified',
      email: 'member@example.test',
      emailVerified: false,
    }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;

  try {
    const response = await worker.fetch(new Request('https://sipandu-registration.test/restore-invitation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer unverified-firebase-id-token',
        'CF-Connecting-IP': '192.0.2.81',
      },
      body: JSON.stringify({ code: 'team-recovery-code-0123456789' }),
    }), {
      TEAM_REGISTRATION_CODE: 'team-recovery-code-0123456789',
      FIREBASE_WEB_API_KEY: 'test-web-api-key',
      FIREBASE_PROJECT_ID: 'gen-lang-client-0197631978',
      FIREBASE_SERVICE_ACCOUNT_JSON: '{"project_id":"gen-lang-client-0197631978","client_email":"test@example.iam.gserviceaccount.com","private_key":"test"}',
      PENDING_REGISTRATIONS: kv,
    });

    assert.equal(response.status, 403);
    assert.deepEqual(writes.filter((key) => key.startsWith('pending:')), []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
