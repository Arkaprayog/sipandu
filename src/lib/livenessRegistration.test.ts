import assert from 'node:assert/strict';
import test from 'node:test';
import type { User } from 'firebase/auth';
import {
  createLivenessSession,
  consumeLoginLivenessProof,
  isLivenessFrameReadyMessage,
  isValidLivenessProofToken,
  parseLivenessFrameMessage,
  registerSelfServiceMemberWithLiveness,
} from './livenessRegistration';
import { TEAM_REGISTRATION_API } from './teamRegistration';

const challengeId = '11111111-1111-4111-8111-111111111111';
const proofId = '22222222-2222-4222-8222-222222222222';
const proofToken = `${challengeId}.${proofId}`;
const user = { getIdToken: async () => 'firebase-id-token' } as unknown as User;

test('accepts only the expected two-part UUID liveness proof token', () => {
  assert.equal(isValidLivenessProofToken(proofToken), true);
  assert.equal(isValidLivenessProofToken(`${challengeId}.not-a-uuid`), false);
  assert.equal(isValidLivenessProofToken(`${challengeId}.${proofId}.extra`), false);
  assert.equal(isValidLivenessProofToken(null), false);
});

test('accepts the iframe ready signal but ignores malformed values', () => {
  assert.equal(isLivenessFrameReadyMessage({ type: 'sipandu:liveness:ready' }), true);
  assert.equal(isLivenessFrameReadyMessage({ type: 'sipandu:liveness:passed' }), false);
  assert.equal(isLivenessFrameReadyMessage(null), false);
});

test('accepts a proof only when its nonce matches the current iframe session', () => {
  assert.deepEqual(parseLivenessFrameMessage({
    type: 'sipandu:liveness:passed',
    nonce: 'current-session-nonce',
    proofToken,
  }, 'current-session-nonce', challengeId), { type: 'passed', proofToken });
  assert.equal(parseLivenessFrameMessage({
    type: 'sipandu:liveness:passed',
    nonce: 'old-session-nonce',
    proofToken,
  }, 'current-session-nonce', challengeId), null);
  assert.equal(parseLivenessFrameMessage({
    type: 'sipandu:liveness:passed',
    nonce: 'current-session-nonce',
    proofToken: 'invalid',
  }, 'current-session-nonce', challengeId), null);
  assert.equal(parseLivenessFrameMessage({
    type: 'sipandu:liveness:passed',
    nonce: 'current-session-nonce',
    proofToken: `33333333-3333-4333-8333-333333333333.${proofId}`,
  }, 'current-session-nonce', challengeId), null);
});

test('creates a Firebase-UID challenge with the server consent version', async () => {
  let requestUrl = '';
  let requestInit: RequestInit | undefined;
  const session = await createLivenessSession(user, '2026-11-16-v1', 'registration', async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(JSON.stringify({
      ok: true,
      challengeId,
      sessionId: 'aws-session-id',
      region: 'us-east-1',
      expiresInSeconds: 180,
    }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  });
  assert.equal(requestUrl, `${TEAM_REGISTRATION_API}/liveness/session`);
  assert.equal(requestInit?.method, 'POST');
  assert.equal(new Headers(requestInit?.headers).get('Authorization'), 'Bearer firebase-id-token');
  assert.deepEqual(JSON.parse(String(requestInit?.body)), { consentVersion: '2026-11-16-v1', purpose: 'registration' });
  assert.equal(session.challengeId, challengeId);
});

test('rejects malformed or overlong AWS Face Liveness session expiry values', async () => {
  await assert.rejects(
    createLivenessSession(user, 'consent-v2', 'registration', async () => new Response(JSON.stringify({
      ok: true,
      challengeId,
      sessionId: 'aws-session-id',
      region: 'ap-southeast-5',
      expiresInSeconds: 600,
    }), { status: 201, headers: { 'Content-Type': 'application/json' } })),
    /Sesi verifikasi wajah belum dapat dibuat/,
  );
  await assert.rejects(
    createLivenessSession(user, 'consent-v2', 'registration', async () => new Response(JSON.stringify({
      ok: true,
      challengeId,
      sessionId: 'aws-session-id',
      region: 'ap-southeast-5',
      expiresInSeconds: 0,
    }), { status: 201, headers: { 'Content-Type': 'application/json' } })),
    /Sesi verifikasi wajah belum dapat dibuat/,
  );
});

test('submits the one-time proof to the registration Worker', async () => {
  let requestUrl = '';
  let requestInit: RequestInit | undefined;
  await registerSelfServiceMemberWithLiveness(user, proofToken, async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(JSON.stringify({ ok: true, status: 'pending_email' }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  assert.equal(requestUrl, `${TEAM_REGISTRATION_API}/register`);
  assert.equal(requestInit?.method, 'POST');
  assert.equal(new Headers(requestInit?.headers).get('Authorization'), 'Bearer firebase-id-token');
  assert.deepEqual(JSON.parse(String(requestInit?.body)), { livenessProofToken: proofToken });
});


test('creates a login-purpose challenge for an existing account', async () => {
  let requestBody: Record<string, unknown> | undefined;
  const session = await createLivenessSession(user, 'consent-v2', 'login', async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ ok: true, challengeId, sessionId: 'login-session', region: 'ap-southeast-5', expiresInSeconds: 180 }), {
      status: 201, headers: { 'Content-Type': 'application/json' },
    });
  });
  assert.equal(session.sessionId, 'login-session');
  assert.deepEqual(requestBody, { consentVersion: 'consent-v2', purpose: 'login' });
});

test('consumes a login liveness proof through the dedicated Worker endpoint', async () => {
  let requestUrl = '';
  let requestInit: RequestInit | undefined;
  await consumeLoginLivenessProof(user, proofToken, async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(JSON.stringify({ ok: true, status: 'verified' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  });
  assert.equal(requestUrl, `${TEAM_REGISTRATION_API}/liveness/login/consume`);
  assert.equal(new Headers(requestInit?.headers).get('Authorization'), 'Bearer firebase-id-token');
  assert.deepEqual(JSON.parse(String(requestInit?.body)), { proofToken });
});
