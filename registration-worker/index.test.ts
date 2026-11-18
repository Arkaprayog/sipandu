import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker, { LivenessChallengeStore, missingActivationConfiguration, parseJson } from './index.ts';

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


test('blocks activation when no self-registration record exists', async () => {
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
    assert.match(result.message || '', /Catatan pendaftaran anggota belum tersedia/);
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


test('registration accepts a Firebase identity token without a team code when one-time liveness proof is valid', async () => {
  const originalFetch = globalThis.fetch;
  const writes: Array<{ key: string; value: string; expirationTtl?: number }> = [];
  const kv = {
    get: async (_key: string) => null,
    put: async (key: string, value: string, options?: { expirationTtl?: number }) => {
      writes.push({ key, value, expirationTtl: options?.expirationTtl });
    },
    delete: async (_key: string) => undefined,
  };
  const challengeId = '11111111-1111-4111-8111-111111111111';
  const proofToken = '22222222-2222-4222-8222-222222222222';
  const livenessRecord = {
    status: 'passed',
    confidence: 98.5,
    proofExpiresAt: Date.now() + 5 * 60 * 1000,
    consentVersion: '2026-11-16-v1',
    consentAcceptedAt: Date.now() - 60_000,
  };
  const livenessNamespace = {
    idFromName: (name: string) => name,
    get: (_id: unknown) => ({
      fetch: async (request: Request) => {
        const body = await request.json() as { proofToken?: string };
        const valid = new URL(request.url).pathname === '/consume-proof' && body.proofToken === proofToken;
        return new Response(JSON.stringify(valid ? { ok: true, record: livenessRecord } : { ok: false }), {
          status: valid ? 200 : 409,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    }),
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
      body: JSON.stringify({ livenessProofToken: `${challengeId}.${proofToken}` }),
    }), {
      FIREBASE_AUTH_API_KEY: 'test-worker-secret-api-key',
      FIREBASE_PROJECT_ID: 'gen-lang-client-0197631978',
      FIREBASE_SERVICE_ACCOUNT_JSON: '{"project_id":"gen-lang-client-0197631978","client_email":"test@example.iam.gserviceaccount.com","private_key":"test"}',
      PENDING_REGISTRATIONS: kv,
      LIVENESS_CHALLENGES: livenessNamespace,
    });
    assert.equal(response.status, 202);
    const result = await response.json() as { ok?: boolean; status?: string };
    assert.equal(result.status, 'pending_email');
    const invitation = writes.find((entry) => entry.key === 'pending:firebase-uid-new-member');
    assert.ok(invitation);
    const saved = JSON.parse(invitation.value);
    assert.equal(saved.status, 'pending_email');
    assert.equal(saved.registrationMode, 'self-service');
    assert.equal(saved.liveness.provider, 'amazon-rekognition-face-liveness');
    assert.equal(saved.liveness.status, 'passed');
    assert.equal(invitation.expirationTtl, 30 * 24 * 60 * 60);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('registration rejects a new Firebase identity without liveness proof', async () => {
  const originalFetch = globalThis.fetch;
  const writes: string[] = [];
  const kv = {
    get: async (_key: string) => null,
    put: async (key: string) => { writes.push(key); },
    delete: async (_key: string) => undefined,
  };
  globalThis.fetch = (async () => new Response(JSON.stringify({
    users: [{ localId: 'firebase-uid-no-liveness', email: 'no-liveness@example.test', emailVerified: false }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
  try {
    const response = await worker.fetch(new Request('https://sipandu-registration.test/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer firebase-id-token',
        'CF-Connecting-IP': '192.0.2.83',
      },
      body: JSON.stringify({}),
    }), {
      FIREBASE_AUTH_API_KEY: 'test-worker-secret-api-key',
      FIREBASE_PROJECT_ID: 'gen-lang-client-0197631978',
      FIREBASE_SERVICE_ACCOUNT_JSON: '{"project_id":"gen-lang-client-0197631978","client_email":"test@example.iam.gserviceaccount.com","private_key":"test"}',
      PENDING_REGISTRATIONS: kv,
    });
    assert.equal(response.status, 403);
    const result = await response.json() as { code?: string };
    assert.equal(result.code, 'LIVENESS_REQUIRED');
    assert.deepEqual(writes.filter((key) => key.startsWith('pending:')), []);
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
    assert.equal(writes.filter((key) => key.startsWith('pending:')).length, 0);
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



test('activates a verified self-registered user as anggota and records activation', async () => {
  const { generateKeyPairSync } = await import('node:crypto');
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const originalFetch = globalThis.fetch;
  const stored = new Map<string, string>([
    ['pending:firebase-open-member', JSON.stringify({
      uid: 'firebase-open-member',
      email: 'member@example.test',
      name: 'Anggota Baru',
      registrationMode: 'self-service',
      status: 'pending_email',
    })],
  ]);
  const assignedClaims: { value?: Record<string, unknown> } = {};

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/accounts:lookup?key=')) {
      return new Response(JSON.stringify({
        users: [{
          localId: 'firebase-open-member',
          email: 'member@example.test',
          emailVerified: true,
          disabled: false,
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
      const body = JSON.parse(String(init?.body || '{}')) as { customAttributes?: string };
      assignedClaims.value = JSON.parse(body.customAttributes || '{}') as Record<string, unknown>;
      return new Response(JSON.stringify({ localId: 'firebase-open-member' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error('Unexpected outbound request: ' + url);
  }) as typeof fetch;

  const kv = {
    get: async (key: string) => stored.get(key) || null,
    put: async (key: string, value: string) => { stored.set(key, value); },
    delete: async (key: string) => { stored.delete(key); },
  };

  try {
    const response = await worker.fetch(new Request('https://sipandu-registration.test/activate', {
      method: 'POST',
      headers: {
        Origin: 'https://sipanduodhiv.my.id',
        Authorization: 'Bearer verified-member-id-token',
        'CF-Connecting-IP': '192.0.2.101',
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

    assert.equal(response.status, 200);
    const result = await response.json() as { ok?: boolean; status?: string; role?: string };
    assert.equal(result.ok, true);
    assert.equal(result.status, 'active');
    assert.equal(result.role, 'anggota');
    assert.equal(assignedClaims.value?.role, 'anggota');
    const activated = JSON.parse(stored.get('pending:firebase-open-member') || '{}') as Record<string, unknown>;
    assert.equal(activated.status, 'active');
    assert.equal(typeof activated.activatedAt, 'number');
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test('disabled Firebase accounts cannot receive an anggota claim', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response(JSON.stringify({
      users: [{
        localId: 'firebase-disabled-member',
        email: 'disabled@example.test',
        emailVerified: true,
        disabled: true,
        customAttributes: '{}',
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  try {
    const response = await worker.fetch(new Request('https://sipandu-registration.test/activate', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer disabled-member-id-token',
        'CF-Connecting-IP': '192.0.2.102',
      },
      body: JSON.stringify({}),
    }), {
      FIREBASE_AUTH_API_KEY: 'test-worker-secret-api-key',
      FIREBASE_PROJECT_ID: 'gen-lang-client-0197631978',
      FIREBASE_SERVICE_ACCOUNT_JSON: '{"project_id":"gen-lang-client-0197631978","client_email":"test@example.iam.gserviceaccount.com","private_key":"unused"}',
      PENDING_REGISTRATIONS: {
        get: async () => JSON.stringify({ uid: 'firebase-disabled-member', email: 'disabled@example.test', status: 'pending_email' }),
        put: async () => undefined,
        delete: async () => undefined,
      },
    });
    assert.equal(response.status, 403);
    assert.equal(calls.length, 1);
    assert.match((await response.json() as { message: string }).message, /dinonaktifkan administrator/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test('activation diagnostics reports the Firebase role permission without changing any account claims', async () => {
  const { generateKeyPairSync } = await import('node:crypto');
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/accounts:lookup?key=')) {
      return new Response(JSON.stringify({
        users: [{ localId: 'diagnostic-user-1', email: 'member@example.test', emailVerified: true, disabled: false }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'diagnostic-service-token', expires_in: 3600 }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('cloudresourcemanager.googleapis.com/v1/projects/')) {
      assert.equal(init?.method, 'POST');
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer diagnostic-service-token');
      assert.deepEqual(JSON.parse(String(init?.body)), { permissions: ['firebaseauth.users.update'] });
      return new Response(JSON.stringify({ permissions: ['firebaseauth.users.update'] }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error('Unexpected outbound request: ' + url);
  }) as typeof fetch;

  try {
    const response = await worker.fetch(new Request('https://sipandu-registration.test/activation-diagnostics', {
      method: 'POST',
      headers: {
        Origin: 'https://sipanduodhiv.my.id',
        'Content-Type': 'application/json',
        Authorization: 'Bearer verified-member-id-token',
        'CF-Connecting-IP': '192.0.2.110',
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
      PENDING_REGISTRATIONS: {
        get: async () => null,
        put: async () => undefined,
        delete: async () => undefined,
      },
    });

    assert.equal(response.status, 200);
    const result = await response.json() as {
      ok?: boolean; configurationReady?: boolean; permissionCheckStatus?: string;
      roleUpdatePermission?: boolean; accountEmailVerified?: boolean; accountEnabled?: boolean;
    };
    assert.equal(result.ok, true);
    assert.equal(result.configurationReady, true);
    assert.equal(result.permissionCheckStatus, 'checked');
    assert.equal(result.roleUpdatePermission, true);
    assert.equal(result.accountEmailVerified, true);
    assert.equal(result.accountEnabled, true);
    assert.equal(calls.length, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('activation diagnostics clearly reports when Firebase role permission is absent', async () => {
  const { generateKeyPairSync } = await import('node:crypto');
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/accounts:lookup?key=')) {
      return new Response(JSON.stringify({
        users: [{ localId: 'diagnostic-user-2', email: 'member@example.test', emailVerified: true, disabled: false }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'diagnostic-service-token', expires_in: 3600 }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('cloudresourcemanager.googleapis.com/v1/projects/')) {
      return new Response(JSON.stringify({ permissions: [] }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error('Unexpected outbound request: ' + url);
  }) as typeof fetch;

  try {
    const response = await worker.fetch(new Request('https://sipandu-registration.test/activation-diagnostics', {
      method: 'POST',
      headers: {
        Origin: 'https://sipanduodhiv.my.id',
        'Content-Type': 'application/json',
        Authorization: 'Bearer verified-member-id-token',
        'CF-Connecting-IP': '192.0.2.111',
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
      PENDING_REGISTRATIONS: {
        get: async () => null,
        put: async () => undefined,
        delete: async () => undefined,
      },
    });

    assert.equal(response.status, 200);
    const result = await response.json() as {
      ok?: boolean; permissionCheckStatus?: string; roleUpdatePermission?: boolean | null;
      message?: string;
    };
    assert.equal(result.ok, true);
    assert.equal(result.permissionCheckStatus, 'checked');
    assert.equal(result.roleUpdatePermission, false);
    assert.match(result.message || '', /belum memiliki izin IAM firebaseauth\.users\.update/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test('liveness Durable Object binds challenges to one UID and rejects proof replay', async () => {
  const values = new Map<string, unknown>();
  const storage = {
    get: async <T = unknown>(key: string) => values.get(key) as T | undefined,
    put: async <T = unknown>(key: string, value: T) => { values.set(key, structuredClone(value)); },
    delete: async (key: string) => values.delete(key),
    setAlarm: async (scheduledTime: number) => { scheduledAlarm = scheduledTime; },
    deleteAlarm: async () => undefined,
  };
  const store = new LivenessChallengeStore({ storage } as never);
  const challengeId = '11111111-1111-4111-8111-111111111111';
  const proofToken = '22222222-2222-4222-8222-222222222222';
  const uid = 'firebase-uid-liveness-test';
  const now = Date.now();
  let scheduledAlarm = 0;

  const request = (action: string, body: Record<string, unknown>) => store.fetch(new Request(
    `https://liveness-challenge.internal/${action}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  ));

  let response = await request('create', {
    challengeId,
    uid,
    sessionId: 'aws-liveness-session-too-long',
    consentVersion: '2026-11-16-v1',
    consentAcceptedAt: now,
    createdAt: now,
    expiresAt: now + 4 * 60 * 1000,
  });
  assert.equal(response.status, 400, 'challenge must not outlive the AWS three-minute SessionId');

  response = await request('create', {
    challengeId,
    uid,
    sessionId: 'aws-liveness-session',
    consentVersion: '2026-11-16-v1',
    consentAcceptedAt: now,
    createdAt: now,
    expiresAt: now + 2 * 60 * 1000,
  });
  assert.equal(response.status, 200);
  response = await request('create', {
    challengeId,
    uid,
    sessionId: 'second-session',
    consentVersion: '2026-11-16-v1',
    createdAt: now,
    expiresAt: now + 2 * 60 * 1000,
  });
  assert.equal(response.status, 409);

  response = await request('credentials', { uid: 'different-firebase-uid' });
  assert.equal(response.status, 403);
  response = await request('credentials', { uid });
  assert.equal(response.status, 200);
  response = await request('credentials', { uid });
  assert.equal(response.status, 409);

  response = await request('verify-start', { uid });
  assert.equal(response.status, 200);
  response = await request('verify-complete', {
    passed: true,
    proofToken,
    proofExpiresAt: Date.now() + 5 * 60 * 1000,
    confidence: 98.5,
  });
  assert.equal(response.status, 403);
  const proofExpiresAt = Date.now() + 5 * 60 * 1000;
  response = await request('verify-complete', {
    uid,
    passed: true,
    proofToken,
    proofExpiresAt,
    confidence: 98.5,
  });
  assert.equal(response.status, 200);
  const passedRecord = values.get('record') as { expiresAt: number; proofExpiresAt: number };
  assert.equal(passedRecord.expiresAt, proofExpiresAt, 'proof record must outlive the AWS SessionId');
  assert.equal(scheduledAlarm, proofExpiresAt, 'cleanup alarm must follow proof expiry');

  response = await request('consume-proof', { uid, proofToken: 'wrong-proof-token' });
  assert.equal(response.status, 409);
  response = await request('consume-proof', { uid, proofToken });
  assert.equal(response.status, 200);
  response = await request('consume-proof', { uid, proofToken });
  assert.equal(response.status, 404);
  assert.equal(values.has('record'), false);
});


test('login liveness proof can only be consumed by an active SIPANDU account', async () => {
  const originalFetch = globalThis.fetch;
  let role: string | undefined = 'anggota';
  let consumeCalls = 0;
  const uid = 'firebase-uid-active-liveness';
  const kvValues = new Map<string, string>();
  const kv = {
    get: async (key: string) => kvValues.get(key) || null,
    put: async (key: string, value: string) => { kvValues.set(key, value); },
    delete: async (key: string) => { kvValues.delete(key); },
  };
  const namespace = {
    idFromName: (name: string) => name,
    get: (_id: unknown) => ({
      fetch: async (request: Request) => {
        assert.equal(new URL(request.url).pathname, '/consume-proof');
        const body = await request.json() as { uid?: string; proofToken?: string; purpose?: string };
        assert.equal(body.uid, uid);
        assert.equal(body.purpose, 'login');
        assert.equal(body.proofToken, '22222222-2222-4222-8222-222222222222');
        consumeCalls += 1;
        return new Response(JSON.stringify({
          ok: true,
          record: { status: 'passed', purpose: 'login', uid },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      },
    }),
  };
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    assert.match(String(input), /accounts:lookup\?key=/);
    return new Response(JSON.stringify({ users: [{
      localId: uid,
      email: 'member@example.test',
      emailVerified: true,
      disabled: false,
      customAttributes: JSON.stringify(role ? { role } : {}),
    }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  const makeRequest = () => new Request('https://sipandu-registration.test/liveness/login/consume', {
    method: 'POST',
    headers: {
      Origin: 'https://sipanduodhiv.my.id',
      'Content-Type': 'application/json',
      Authorization: 'Bearer active-user-id-token',
      'CF-Connecting-IP': '192.0.2.122',
    },
    body: JSON.stringify({
      proofToken: '11111111-1111-4111-8111-111111111111.22222222-2222-4222-8222-222222222222',
    }),
  });

  try {
    const env = {
      FIREBASE_AUTH_API_KEY: 'test-worker-secret-api-key',
      PENDING_REGISTRATIONS: kv,
      LIVENESS_CHALLENGES: namespace,
    };
    let response = await worker.fetch(makeRequest(), env);
    assert.equal(response.status, 200);
    assert.equal((await response.json() as { status?: string }).status, 'verified');
    assert.equal(consumeCalls, 1);

    role = undefined;
    response = await worker.fetch(makeRequest(), env);
    assert.equal(response.status, 401);
    assert.equal(consumeCalls, 1, 'an account without an active SIPANDU role must not consume a proof');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('liveness challenge purpose cannot be changed between registration and login', async () => {
  const values = new Map<string, unknown>();
  const storage = {
    get: async <T = unknown>(key: string) => values.get(key) as T | undefined,
    put: async <T = unknown>(key: string, value: T) => { values.set(key, structuredClone(value)); },
    delete: async (key: string) => values.delete(key),
    setAlarm: async (_scheduledTime: number) => undefined,
    deleteAlarm: async () => undefined,
  };
  const store = new LivenessChallengeStore({ storage } as never);
  const challengeId = '33333333-3333-4333-8333-333333333333';
  const uid = 'firebase-uid-purpose-test';
  const request = (action: string, body: Record<string, unknown>) => store.fetch(new Request(
    `https://liveness-challenge.internal/${action}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  ));

  let response = await request('create', {
    challengeId, uid, purpose: 'login', sessionId: 'login-session', consentVersion: 'consent-v2',
    createdAt: Date.now(), expiresAt: Date.now() + 2 * 60 * 1000,
  });
  assert.equal(response.status, 200);
  response = await request('credentials', { uid, purpose: 'registration' });
  assert.equal(response.status, 403);
  response = await request('credentials', { uid, purpose: 'login' });
  assert.equal(response.status, 200);
});
