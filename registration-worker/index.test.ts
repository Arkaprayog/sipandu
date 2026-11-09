import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker, { missingActivationConfiguration, parseJson } from './index.ts';

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


test('public intake rejects an invalid Turnstile token before contacting Firestore', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  const kv = {
    get: async (_key: string) => null,
    put: async (_key: string, _value: string) => undefined,
    delete: async (_key: string) => undefined,
  };
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/turnstile/v0/siteverify')) {
      return new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error('Firestore must not be called when Turnstile fails.');
  }) as typeof fetch;

  try {
    const response = await worker.fetch(new Request('https://sipandu-registration.test/public-stage-one-intake', {
      method: 'POST',
      headers: {
        Origin: 'https://sipanduodhiv.my.id',
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '192.0.2.90',
      },
      body: JSON.stringify({
        turnstileToken: 'invalid-test-token',
        payload: {
          timestamp: new Date().toISOString(),
          namaLengkap: 'Responden Contoh',
          nik: '1234567890123456',
          usia: 30,
          jenisKelamin: 'Perempuan',
          kotaDomisili: 'Kota Medan',
          alamatLengkap: '',
          noHpWa: '081234567890',
          jenisBantuan: 'Bantuan',
          intervensiMental: '',
          desil: 0,
          fotoDiri: 'data:image/jpeg;base64,' + 'A'.repeat(100),
          fotoKtp: 'data:image/jpeg;base64,' + 'A'.repeat(100),
          statusAsesmen: 'Tahap Awal',
        },
      }),
    }), {
      TURNSTILE_SECRET_KEY: 'server-only-test-secret',
      FIREBASE_PROJECT_ID: 'gen-lang-client-0197631978',
      FIREBASE_DATABASE_ID: 'database-test',
      FIREBASE_SERVICE_ACCOUNT_JSON: '{"project_id":"gen-lang-client-0197631978","client_email":"test@example.iam.gserviceaccount.com","private_key":"unused"}',
      PENDING_REGISTRATIONS: kv,
    });

    assert.equal(response.status, 403);
    assert.match((await response.json() as { message: string }).message, /Verifikasi keamanan gagal/);
    assert.equal(calls.length, 1);
    assert.match(calls[0], /turnstile\/v0\/siteverify/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('public intake creates a Firestore record only after valid Turnstile verification', async () => {
  const { generateKeyPairSync } = await import('node:crypto');
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  const savedFields: { value?: Record<string, unknown> } = {};
  const kv = {
    get: async (_key: string) => null,
    put: async (_key: string, _value: string) => undefined,
    delete: async (_key: string) => undefined,
  };
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/turnstile/v0/siteverify')) {
      return new Response(JSON.stringify({
        success: true,
        hostname: 'sipanduodhiv.my.id',
        action: 'sipandu-stage-one',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'service-account-test-token', expires_in: 3600 }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/documents/stageOneIntake?documentId=')) {
      assert.equal(init?.method, 'POST');
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer service-account-test-token');
      savedFields.value = JSON.parse(String(init?.body)).fields as Record<string, unknown>;
      return new Response(JSON.stringify({ name: url }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error('Unexpected outbound request: ' + url);
  }) as typeof fetch;

  try {
    const response = await worker.fetch(new Request('https://sipandu-registration.test/public-stage-one-intake', {
      method: 'POST',
      headers: {
        Origin: 'https://sipanduodhiv.my.id',
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '192.0.2.92',
      },
      body: JSON.stringify({
        turnstileToken: 'valid-test-token',
        payload: {
          timestamp: new Date().toISOString(),
          namaLengkap: 'Responden Contoh',
          nik: '1234567890123456',
          usia: 30,
          jenisKelamin: 'Perempuan',
          kotaDomisili: 'Kota Medan',
          alamatLengkap: '',
          noHpWa: '081234567890',
          jenisBantuan: 'Bantuan',
          intervensiMental: '',
          desil: 0,
          fotoDiri: 'data:image/jpeg;base64,' + 'A'.repeat(100),
          fotoKtp: 'data:image/jpeg;base64,' + 'A'.repeat(100),
          statusAsesmen: 'Tahap Awal',
        },
      }),
    }), {
      TURNSTILE_SECRET_KEY: 'server-only-test-secret',
      FIREBASE_PROJECT_ID: 'gen-lang-client-0197631978',
      FIREBASE_DATABASE_ID: 'ai-studio-sipanduodhiv-985a0308-7693-46e1-b6d3-fdbce52371a8',
      FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
        project_id: 'gen-lang-client-0197631978',
        client_email: 'test@example.iam.gserviceaccount.com',
        private_key: privateKey,
      }),
      PENDING_REGISTRATIONS: kv,
    });

    assert.equal(response.status, 201);
    const result = await response.json() as { ok?: boolean; id?: string };
    assert.equal(result.ok, true);
    assert.ok(result.id);
    assert.equal(calls.length, 3);
    assert.match(calls[0], /turnstile\/v0\/siteverify/);
    assert.equal(calls[1], 'https://oauth2.googleapis.com/token');
    assert.match(calls[2], /documents\/stageOneIntake/);
    assert.equal((savedFields.value?.source as { stringValue: string }).stringValue, 'respondent-link');
    assert.equal((savedFields.value?.nik as { stringValue: string }).stringValue, '1234567890123456');
    assert.ok(savedFields.value?.submittedAt);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('public intake refuses to run without a Turnstile secret', async () => {
  const response = await worker.fetch(new Request('https://sipandu-registration.test/public-stage-one-intake', {
    method: 'POST',
    headers: {
      Origin: 'https://sipanduodhiv.my.id',
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '192.0.2.91',
    },
    body: JSON.stringify({ turnstileToken: 'token', payload: {} }),
  }), {
    FIREBASE_PROJECT_ID: 'gen-lang-client-0197631978',
    FIREBASE_DATABASE_ID: 'database-test',
    FIREBASE_SERVICE_ACCOUNT_JSON: '{}',
    PENDING_REGISTRATIONS: {
      get: async () => null,
      put: async () => undefined,
      delete: async () => undefined,
    },
  });
  assert.equal(response.status, 503);
});

test('activation configuration does not require a shared team code', () => {
  const env = {
    FIREBASE_AUTH_API_KEY: 'worker-secret-api-key',
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
    FIREBASE_AUTH_API_KEY: 'worker-secret-api-key',
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
      body: JSON.stringify({}),
    }), {
      FIREBASE_AUTH_API_KEY: 'test-worker-secret-api-key',
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
      body: JSON.stringify({}),
    }), {
      FIREBASE_AUTH_API_KEY: 'test-worker-secret-api-key',
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


test('registration accepts a Firebase identity token without any team code', async () => {
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
    users: [{ localId: 'firebase-uid-new-member', email: 'member@example.test', emailVerified: false }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
  try {
    const response = await worker.fetch(new Request('https://sipandu-registration.test/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer firebase-id-token',
        'CF-Connecting-IP': '192.0.2.82',
      },
      body: JSON.stringify({}),
    }), {
      FIREBASE_AUTH_API_KEY: 'test-worker-secret-api-key',
      FIREBASE_PROJECT_ID: 'gen-lang-client-0197631978',
      FIREBASE_SERVICE_ACCOUNT_JSON: '{"project_id":"gen-lang-client-0197631978","client_email":"test@example.iam.gserviceaccount.com","private_key":"test"}',
      PENDING_REGISTRATIONS: kv,
    });
    assert.equal(response.status, 200);
    const invitation = writes.find((entry) => entry.key === 'pending:firebase-uid-new-member');
    assert.ok(invitation);
    assert.equal(invitation.expirationTtl, 7 * 24 * 60 * 60);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
