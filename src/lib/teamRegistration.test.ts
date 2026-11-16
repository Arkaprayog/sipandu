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
  const requests: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(String(input));
    assert.equal(init?.method, 'POST');
    assert.match(String((init?.headers as Record<string, string>)?.Authorization), /^Bearer firebase-id-token$/);
    return new Response(JSON.stringify({ ok: true, status: 'active', role: 'anggota' }), { status: 200 });
  }) as typeof fetch;
  try {
    await activateVerifiedTeamMember(fake.user);
    assert.match(requests[0], /\/activate$/);
    assert.deepEqual(requests.length, 1);
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

test('activation failure automatically checks IAM and explains a missing role-update permission', async () => {
  const originalFetch = globalThis.fetch;
  const fake = fakeUser();
  const requests: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    requests.push(url);
    if (url.endsWith('/activate')) {
      return new Response(JSON.stringify({ ok: false, message: 'Firebase menolak pemberian peran anggota.' }), { status: 503 });
    }
    return new Response(JSON.stringify({
      ok: true,
      configurationReady: true,
      permissionCheckStatus: 'checked',
      roleUpdatePermission: false,
    }), { status: 200 });
  }) as typeof fetch;
  try {
    await assert.rejects(
      () => activateVerifiedTeamMember(fake.user),
      /belum memiliki izin IAM firebaseauth\.users\.update/,
    );
    assert.match(requests[0], /\/activate$/);
    assert.match(requests[1], /\/activation-diagnostics$/);
    assert.deepEqual(fake.calls, [true, true]);
  } finally { globalThis.fetch = originalFetch; }
});

test('activation diagnostics never convert an unavailable IAM check into successful activation', async () => {
  const originalFetch = globalThis.fetch;
  const fake = fakeUser();
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    if (String(input).endsWith('/activate')) {
      return new Response(JSON.stringify({ ok: false, message: 'Aktivasi gagal.' }), { status: 503 });
    }
    return new Response(JSON.stringify({
      ok: true,
      configurationReady: true,
      permissionCheckStatus: 'unavailable',
      roleUpdatePermission: null,
    }), { status: 200 });
  }) as typeof fetch;
  try {
    await assert.rejects(() => activateVerifiedTeamMember(fake.user), /belum dapat dipastikan/);
    assert.deepEqual(fake.calls, [true, true]);
  } finally { globalThis.fetch = originalFetch; }
});
