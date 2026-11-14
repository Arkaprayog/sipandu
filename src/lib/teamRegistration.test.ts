import test from 'node:test';
import assert from 'node:assert/strict';
import { activateVerifiedTeamMember } from './teamRegistration';

function fakeUser() {
  const calls: boolean[] = [];
  return {
    calls,
    user: { getIdToken: async (forceRefresh?: boolean) => { calls.push(Boolean(forceRefresh)); return 'firebase-id-token'; } } as never,
  };
}

test('verified member activation requires Worker to issue anggota role and refreshes token', async () => {
  const originalFetch = globalThis.fetch;
  const fake = fakeUser();
  let requestUrl = '';
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestUrl = String(input);
    assert.equal(init?.method, 'POST');
    assert.match(String((init?.headers as Record<string, string>)?.Authorization), /^Bearer firebase-id-token$/);
    return new Response(JSON.stringify({ ok: true, status: 'active', role: 'anggota' }), { status: 200 });
  }) as typeof fetch;
  try {
    await activateVerifiedTeamMember(fake.user);
    assert.match(requestUrl, /\/activate$/);
    assert.deepEqual(fake.calls, [true, true]);
  } finally { globalThis.fetch = originalFetch; }
});

test('activation rejects a successful HTTP response that did not issue anggota role', async () => {
  const originalFetch = globalThis.fetch;
  const fake = fakeUser();
  globalThis.fetch = (async () => new Response(JSON.stringify({ ok: true, status: 'active' }), { status: 200 })) as typeof fetch;
  try {
    await assert.rejects(() => activateVerifiedTeamMember(fake.user), /belum mengaktifkan akun sebagai anggota/);
    assert.deepEqual(fake.calls, [true]);
  } finally { globalThis.fetch = originalFetch; }
});

test('activation surfaces Worker error and does not refresh claims on failure', async () => {
  const originalFetch = globalThis.fetch;
  const fake = fakeUser();
  globalThis.fetch = (async () => new Response(JSON.stringify({ ok: false, message: 'Izin IAM belum tersedia.' }), { status: 503 })) as typeof fetch;
  try {
    await assert.rejects(() => activateVerifiedTeamMember(fake.user), /Izin IAM belum tersedia/);
    assert.deepEqual(fake.calls, [true]);
  } finally { globalThis.fetch = originalFetch; }
});
