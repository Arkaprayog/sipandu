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

test('activation configuration does not require a team code or pending-registration KV', () => {
  const env = {
    FIREBASE_AUTH_API_KEY: 'worker-secret-api-key',
    FIREBASE_PROJECT_ID: 'gen-lang-client-0197631978',
    FIREBASE_SERVICE_ACCOUNT_JSON: '{"project_id":"gen-lang-client-0197631978"}',
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


test('blocks activation when no Owner-approved registration record exists', async () => {
  const { generateKeyPairSync } = await import('node:crypto');
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  let assignedClaims = '';
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/accounts:lookup?key=')) {
      return new Response(JSON.stringify({
        users: [{
          localId: 'firebase-uid-open-member',
          email: 'member@example.test',
          emailVerified: true,
          customAttributes: '{}',
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'service-account-test-token', expires_in: 3600 }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/accounts:update')) {
      assignedClaims = String(init?.body || '');
      return new Response(JSON.stringify({ localId: 'firebase-uid-open-member' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error('Unexpected outbound request: ' + url);
  }) as typeof fetch;

  try {
    const response = await worker.fetch(new Request('https://sipandu-registration.test/activate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer verified-member-id-token',
      },
      body: JSON.stringify({}),
    }), {
      FIREBASE_AUTH_API_KEY: 'test-worker-secret-api-key',
      FIREBASE_PROJECT_ID: 'gen-lang-client-0197631978',
      FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
        project_id: 'gen-lang-client-0197631978',
        client_email: 'test@example.iam.gserviceaccount.com',
        private_key: privateKey,
      }),
    });

    assert.equal(response.status, 503);
    const result = await response.json() as { ok?: boolean; message?: string };
    assert.equal(result.ok, false);
    assert.match(result.message || '', /persetujuan Owner belum tersedia/);
    assert.equal(assignedClaims, '');
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
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


test('does not restore or create an invitation without a prior Owner-approved request', async () => {
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

    assert.equal(response.status, 404);
    const result = await response.json() as { ok?: boolean; message?: string };
    assert.equal(result.ok, false);
    assert.match(result.message || '', /Permohonan belum tercatat/);
    assert.equal(writes.some((entry) => entry.key.startsWith('pending:')), false);
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
    assert.equal(response.status, 202);
    const result = await response.json() as { ok?: boolean; status?: string };
    assert.equal(result.status, 'pending_owner');
    const invitation = writes.find((entry) => entry.key === 'pending:firebase-uid-new-member');
    assert.ok(invitation);
    assert.equal(JSON.parse(invitation.value).status, 'pending_owner');
    assert.equal(invitation.expirationTtl, 7 * 24 * 60 * 60);
  } finally {
    globalThis.fetch = originalFetch;
  }
});



test('does not let every Supervisor approve new registrations by default', async () => {
  const originalFetch = globalThis.fetch;
  const writes: string[] = [];
  globalThis.fetch = (async () => new Response(JSON.stringify({
    users: [{
      localId: 'firebase-supervisor-not-delegated',
      email: 'supervisor@example.test',
      customAttributes: JSON.stringify({ role: 'supervisor' }),
    }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
  const kv = {
    get: async (_key: string) => null,
    put: async (key: string) => { writes.push(key); },
    delete: async (_key: string) => undefined,
    list: async () => ({ keys: [], list_complete: true }),
  };
  try {
    const response = await worker.fetch(new Request('https://sipandu-registration.test/owner/approve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer supervisor-id-token',
        'CF-Connecting-IP': '192.0.2.84',
      },
      body: JSON.stringify({ uid: 'firebase-new-applicant' }),
    }), {
      FIREBASE_AUTH_API_KEY: 'test-worker-secret-api-key',
      PENDING_REGISTRATIONS: kv,
    });
    assert.equal(response.status, 403);
    assert.match((await response.json() as { message: string }).message, /ditunjuk secara khusus oleh Owner/);
    assert.deepEqual(writes, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Owner can list only pending team registrations', async () => {
  const originalFetch = globalThis.fetch;
  const stored = new Map<string, string>([
    ['pending:firebase-waiting', JSON.stringify({ uid: 'firebase-waiting', email: 'waiting@example.test', createdAt: 1234, status: 'pending_owner' })],
    ['pending:firebase-approved', JSON.stringify({ uid: 'firebase-approved', email: 'approved@example.test', createdAt: 1234, status: 'approved' })],
  ]);
  globalThis.fetch = (async () => new Response(JSON.stringify({
    users: [{
      localId: 'firebase-existing-owner',
      email: 'owner@example.test',
      customAttributes: JSON.stringify({ role: 'owner' }),
    }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
  const kv = {
    get: async (key: string) => stored.get(key) || null,
    put: async (key: string, value: string) => { stored.set(key, value); },
    delete: async (key: string) => { stored.delete(key); },
    list: async (options?: { prefix?: string }) => ({
      keys: [...stored.keys()].filter((key) => key.startsWith(options?.prefix || '')).map((name) => ({ name })),
      list_complete: true,
    }),
  };
  try {
    const response = await worker.fetch(new Request('https://sipandu-registration.test/owner/pending', {
      method: 'GET',
      headers: { Authorization: 'Bearer owner-id-token' },
    }), {
      FIREBASE_AUTH_API_KEY: 'test-worker-secret-api-key',
      PENDING_REGISTRATIONS: kv,
    });
    assert.equal(response.status, 200);
    const result = await response.json() as { items: Array<{ uid: string; status: string }> };
    assert.deepEqual(result.items.map((item) => item.uid), ['firebase-waiting']);
    assert.equal(result.items[0].status, 'pending_owner');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('registration status returns the authenticated user own approval state', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    users: [{ localId: 'firebase-status-user', email: 'member@example.test' }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
  try {
    const response = await worker.fetch(new Request('https://sipandu-registration.test/registration-status', {
      method: 'POST',
      headers: { Authorization: 'Bearer member-id-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }), {
      FIREBASE_AUTH_API_KEY: 'test-worker-secret-api-key',
      PENDING_REGISTRATIONS: {
        get: async (key: string) => key === 'pending:firebase-status-user'
          ? JSON.stringify({ uid: 'firebase-status-user', status: 'pending_owner' })
          : null,
        put: async () => undefined,
        delete: async () => undefined,
      },
    });
    assert.equal(response.status, 200);
    const result = await response.json() as { status: string };
    assert.equal(result.status, 'pending_owner');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('activation explains missing firebaseauth.users.update permission and preserves the pending invitation', async () => {
  const { generateKeyPairSync } = await import('node:crypto');
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const originalFetch = globalThis.fetch;
  const pendingKey = 'pending:firebase-uid-permission-test';
  const pendingValue = JSON.stringify({
    uid: 'firebase-uid-permission-test',
    email: 'member@example.test',
    createdAt: Date.now(),
    status: 'approved',
  });
  const deletedKeys: string[] = [];
  const kv = {
    get: async (key: string) => key === pendingKey ? pendingValue : null,
    put: async (_key: string, _value: string, _options?: { expirationTtl?: number }) => undefined,
    delete: async (key: string) => { deletedKeys.push(key); },
  };

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/accounts:lookup?key=')) {
      return new Response(JSON.stringify({
        users: [{
          localId: 'firebase-uid-permission-test',
          email: 'member@example.test',
          emailVerified: true,
          customAttributes: '{}',
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'service-account-test-token', expires_in: 3600 }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/accounts:update')) {
      return new Response(JSON.stringify({
        error: { status: 'PERMISSION_DENIED', message: 'INSUFFICIENT_PERMISSION' },
      }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error('Unexpected outbound request: ' + url);
  }) as typeof fetch;

  try {
    const response = await worker.fetch(new Request('https://sipandu-registration.test/activate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer verified-member-id-token',
        'CF-Connecting-IP': '192.0.2.83',
      },
      body: JSON.stringify({}),
    }), {
      FIREBASE_AUTH_API_KEY: 'test-worker-secret-api-key',
      FIREBASE_PROJECT_ID: 'gen-lang-client-0197631978',
      FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
        project_id: 'gen-lang-client-0197631978',
        client_email: 'test@example.iam.gserviceaccount.com',
        private_key: privateKey,
      }),
      PENDING_REGISTRATIONS: kv,
    });

    assert.equal(response.status, 503);
    const result = await response.json() as { ok?: boolean; message?: string };
    assert.equal(result.ok, false);
    assert.match(result.message || '', /firebaseauth[.]users[.]update/);
    assert.match(result.message || '', /tidak perlu membuat akun baru/);
    assert.deepEqual(deletedKeys, []);
    assert.equal(await kv.get(pendingKey), pendingValue);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
