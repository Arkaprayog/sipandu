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
