import { LIVENESS_UI_HTML, LIVENESS_UI_JS } from './liveness-ui.ts';

interface KVBinding {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list?(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    keys: Array<{ name: string }>;
    cursor?: string;
    list_complete: boolean;
  }>;
}

interface Env {
  FIREBASE_AUTH_API_KEY?: string;
  /** Legacy fallback for environments not yet deployed from the hardened config. */
  FIREBASE_WEB_API_KEY?: string;
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_DATABASE_ID?: string;
  FIREBASE_SERVICE_ACCOUNT_JSON?: string;
  TURNSTILE_SECRET_KEY?: string;
  RESEND_API_KEY?: string;
  SIPANDU_EMAIL_FROM?: string;
  OWNER_NOTIFICATION_EMAIL?: string;
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  AWS_FACE_LIVENESS_ROLE_ARN?: string;
  AWS_FACE_LIVENESS_REGION?: string;
  LIVENESS_MIN_CONFIDENCE?: string;
  LIVENESS_CONSENT_VERSION?: string;
  LIVENESS_ENFORCEMENT_START?: string;
  LIVENESS_CHALLENGES?: LivenessDurableObjectNamespace;
  PENDING_REGISTRATIONS?: KVBinding;
}

interface FirebaseUserLookup {
  localId: string;
  email?: string;
  displayName?: string;
  emailVerified?: boolean;
  disabled?: boolean;
  customAttributes?: string;
  createdAt?: string;
}

const ALLOWED_ORIGINS = new Set([
  'https://sipandu.aryprayoga139.workers.dev',
  'https://sipanduodhiv.my.id',
  'https://sipandu-registration.aryprayoga139.workers.dev',
  'https://localhost',
  'http://localhost',
  'http://localhost:3000',
  'capacitor://localhost',
]);

const cachedGoogleAccessTokens = new Map<string, { token: string; expiresAt: number }>();

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function jsonResponse(payload: Record<string, unknown>, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders(origin),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function missingConfiguration(env: Env): string[] {
  const missing: string[] = [];
  if (!env.FIREBASE_AUTH_API_KEY && !env.FIREBASE_WEB_API_KEY) missing.push('FIREBASE_AUTH_API_KEY');
  if (!env.FIREBASE_PROJECT_ID) missing.push('FIREBASE_PROJECT_ID');
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) missing.push('FIREBASE_SERVICE_ACCOUNT_JSON');
  if (!env.PENDING_REGISTRATIONS) missing.push('PENDING_REGISTRATIONS KV');
  return missing;
}

export function missingLivenessConfiguration(env: Env): string[] {
  const missing: string[] = [];
  if (!env.AWS_ACCESS_KEY_ID) missing.push('AWS_ACCESS_KEY_ID');
  if (!env.AWS_SECRET_ACCESS_KEY) missing.push('AWS_SECRET_ACCESS_KEY');
  if (!env.AWS_FACE_LIVENESS_ROLE_ARN) missing.push('AWS_FACE_LIVENESS_ROLE_ARN');
  if (!env.LIVENESS_CHALLENGES) missing.push('LIVENESS_CHALLENGES Durable Object');
  return missing;
}

interface LivenessDurableObjectStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T = unknown>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  setAlarm?(scheduledTime: number): Promise<void>;
  deleteAlarm?(): Promise<void>;
}
interface LivenessDurableObjectState {
  storage: LivenessDurableObjectStorage;
}
interface LivenessDurableObjectStub {
  fetch(input: Request): Promise<Response>;
}
interface LivenessDurableObjectNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): LivenessDurableObjectStub;
}
interface LivenessChallengeRecord {
  challengeId: string;
  uid: string;
  sessionId: string;
  consentVersion: string;
  consentAcceptedAt: number;
  createdAt: number;
  expiresAt: number;
  credentialsIssuedAt?: number;
  status: 'created' | 'verifying' | 'passed' | 'failed';
  proofToken?: string;
  confidence?: number;
  proofExpiresAt?: number;
  consumedAt?: number;
}

function livenessStore(env: Env, challengeId: string): LivenessDurableObjectStub {
  if (!env.LIVENESS_CHALLENGES) throw new Error('Pemeriksaan liveness belum dikonfigurasi.');
  return env.LIVENESS_CHALLENGES.get(env.LIVENESS_CHALLENGES.idFromName(challengeId));
}

async function callLivenessStore(
  env: Env,
  challengeId: string,
  action: string,
  payload: Record<string, unknown> = {},
): Promise<{ ok?: boolean; message?: string; record?: LivenessChallengeRecord }> {
  const response = await livenessStore(env, challengeId).fetch(new Request(
    `https://liveness-challenge.internal/${action}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
  ));
  const result = await response.json().catch(() => ({})) as { ok?: boolean; message?: string; record?: LivenessChallengeRecord };
  if (!response.ok || !result.ok) throw new Error(result.message || 'Sesi liveness tidak valid atau sudah kedaluwarsa.');
  return result;
}

function livenessRegion(env: Env): string {
  return env.AWS_FACE_LIVENESS_REGION || 'ap-southeast-5';
}

function livenessConfidenceThreshold(env: Env): number {
  const value = Number(env.LIVENESS_MIN_CONFIDENCE || '90');
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : 90;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256(key: Uint8Array, value: string): Promise<Uint8Array> {
  // WebCrypto TypeScript definitions require an ArrayBuffer-backed view;
  // normalize keys that may be backed by SharedArrayBuffer before import.
  const keyBuffer = new ArrayBuffer(key.byteLength);
  new Uint8Array(keyBuffer).set(key);
  const imported = await crypto.subtle.importKey('raw', keyBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', imported, new TextEncoder().encode(value));
  return new Uint8Array(signature);
}

function hexBytes(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function signAwsRequest(
  env: Env,
  service: 'rekognition' | 'sts',
  region: string,
  url: URL,
  payload: string,
  contentType: string,
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) {
    throw new Error('Kredensial AWS Face Liveness belum dipasang pada Worker sipandu-registration.');
  }
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const headers: Record<string, string> = {
    'content-type': contentType,
    host: url.host,
    'x-amz-date': amzDate,
    ...extraHeaders,
  };
  const canonicalHeaderNames = Object.keys(headers).map((name) => name.toLowerCase()).sort();
  const canonicalHeaders = canonicalHeaderNames
    .map((name) => `${name}:${headers[name] ?? headers[Object.keys(headers).find((key) => key.toLowerCase() === name) || '']}`.trim() + '\n')
    .join('');
  const signedHeaders = canonicalHeaderNames.join(';');
  const payloadHash = await sha256Hex(payload);
  const canonicalRequest = [
    'POST',
    url.pathname || '/',
    url.searchParams.toString(),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n');
  const encoder = new TextEncoder();
  const kDate = await hmacSha256(encoder.encode('AWS4' + env.AWS_SECRET_ACCESS_KEY), dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  const kSigning = await hmacSha256(kService, 'aws4_request');
  const signature = hexBytes(await hmacSha256(kSigning, stringToSign));
  const authorization = `AWS4-HMAC-SHA256 Credential=${env.AWS_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const requestHeaders = new Headers(headers);
  requestHeaders.set('Authorization', authorization);
  requestHeaders.delete('host');
  return fetch(url, { method: 'POST', headers: requestHeaders, body: payload });
}

async function rekognitionRequest<T>(
  env: Env,
  operation: 'CreateFaceLivenessSession' | 'GetFaceLivenessSessionResults',
  payload: Record<string, unknown>,
): Promise<T> {
  const region = livenessRegion(env);
  const url = new URL(`https://rekognition.${region}.amazonaws.com/`);
  const body = JSON.stringify(payload);
  const response = await signAwsRequest(
    env,
    'rekognition',
    region,
    url,
    body,
    'application/x-amz-json-1.1',
    { 'x-amz-target': `Rekognition_20220330.${operation}` },
  );
  const result = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const code = String(result.__type || result.code || 'AWS_REKOGNITION_ERROR').split('#').pop();
    throw new Error(`Layanan pemeriksaan wajah AWS menolak permintaan (${code}).`);
  }
  return result as T;
}

function xmlValue(xml: string, tag: string): string {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml);
  return (match?.[1] || '').replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"').replaceAll('&apos;', "'");
}

async function assumeLivenessStreamingRole(env: Env): Promise<{
  accessKeyId: string; secretAccessKey: string; sessionToken: string; expiration: string;
}> {
  if (!env.AWS_FACE_LIVENESS_ROLE_ARN) throw new Error('AWS_FACE_LIVENESS_ROLE_ARN belum dikonfigurasi.');
  const region = livenessRegion(env);
  const url = new URL(`https://sts.${region}.amazonaws.com/`);
  const sessionPolicy = JSON.stringify({
    Version: '2012-10-17',
    Statement: [{ Effect: 'Allow', Action: ['rekognition:StartFaceLivenessSession'], Resource: '*' }],
  });
  const body = new URLSearchParams({
    Action: 'AssumeRole',
    Version: '2011-06-15',
    RoleArn: env.AWS_FACE_LIVENESS_ROLE_ARN,
    RoleSessionName: `sipandu-liveness-${crypto.randomUUID().slice(0, 8)}`,
    DurationSeconds: '900',
    Policy: sessionPolicy,
  }).toString();
  const response = await signAwsRequest(
    env, 'sts', region, url, body, 'application/x-www-form-urlencoded; charset=utf-8',
  );
  const xml = await response.text();
  if (!response.ok) throw new Error('AWS STS tidak dapat menerbitkan kredensial streaming Face Liveness.');
  const accessKeyId = xmlValue(xml, 'AccessKeyId');
  const secretAccessKey = xmlValue(xml, 'SecretAccessKey');
  const sessionToken = xmlValue(xml, 'SessionToken');
  const expiration = xmlValue(xml, 'Expiration');
  if (!accessKeyId || !secretAccessKey || !sessionToken || !expiration) {
    throw new Error('AWS STS mengembalikan kredensial sementara yang tidak lengkap.');
  }
  return { accessKeyId, secretAccessKey, sessionToken, expiration };
}

async function isLegacyRegistrationAccount(env: Env, firebaseUser: FirebaseUserLookup): Promise<boolean> {
  const cutoff = Date.parse(env.LIVENESS_ENFORCEMENT_START || '');
  const createdAt = Number(firebaseUser.createdAt || 0);
  return Number.isFinite(cutoff) && cutoff > 0 && Number.isFinite(createdAt) && createdAt > 0 && createdAt < cutoff;
}

 // Activation requires a valid Firebase identity and verified email; no team invitation is required.
 export function missingActivationConfiguration(env: Env): string[] {
   const missing: string[] = [];
   if (!env.FIREBASE_AUTH_API_KEY && !env.FIREBASE_WEB_API_KEY) missing.push('FIREBASE_AUTH_API_KEY');
   if (!env.FIREBASE_PROJECT_ID) missing.push('FIREBASE_PROJECT_ID');
   if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) missing.push('FIREBASE_SERVICE_ACCOUNT_JSON');
   return missing;
 }

const MAX_REQUEST_BODY_BYTES = 12_000;
export async function parseJson(request: Request, maxBytes = MAX_REQUEST_BODY_BYTES): Promise<Record<string, unknown> | null> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) return null;
  const contentLengthHeader = request.headers.get('Content-Length');
  if (contentLengthHeader !== null) {
    const contentLength = Number(contentLengthHeader);
    if (!Number.isSafeInteger(contentLength) || contentLength < 0 || contentLength > maxBytes) return null;
  }
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        try { await reader.cancel(); } catch { /* request body rejected */ }
        return null;
      }
      chunks.push(value);
    }
  } catch {
    try { await reader.cancel(); } catch { /* preserve read failure */ }
    return null;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

async function allowAttempt(env: Env, request: Request, limit = 12): Promise<boolean> {
  if (!env.PENDING_REGISTRATIONS) return false;
  const address = request.headers.get('CF-Connecting-IP') || 'unknown';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(address));
  const key = Array.from(new Uint8Array(digest).slice(0, 12), (value) => value.toString(16).padStart(2, '0')).join('');
  const storageKey = `rate:${key}`;
  const existing = Number(await env.PENDING_REGISTRATIONS.get(storageKey) || 0);
  if (existing >= limit) return false;
  await env.PENDING_REGISTRATIONS.put(storageKey, String(existing + 1), { expirationTtl: 60 });
  return true;
}

async function lookupLivenessApplicant(env: Env, request: Request): Promise<FirebaseUserLookup> {
  const authorization = request.headers.get('Authorization') || '';
  const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!idToken) throw new Error('Sesi Firebase belum tersedia. Masuk kembali ke SIPANDU.');
  const user = await lookupFirebaseUser(env, idToken);
  if (!user.localId || !user.email || user.disabled) {
    throw new Error('Akun Firebase tidak valid atau sudah dinonaktifkan.');
  }
  if (user.emailVerified) {
    throw new Error('Pemeriksaan ini hanya tersedia untuk proses pendaftaran akun baru yang belum memverifikasi email.');
  }
  let claims: Record<string, unknown> = {};
  try {
    claims = user.customAttributes ? JSON.parse(user.customAttributes) as Record<string, unknown> : {};
    if (!claims || typeof claims !== 'object' || Array.isArray(claims)) throw new Error('Invalid claims');
  } catch {
    throw new Error('Klaim akun tidak dapat diverifikasi.');
  }
  if (claims.role) throw new Error('Akun yang sudah memiliki peran SIPANDU tidak dapat menggunakan jalur pendaftaran baru.');
  return user;
}

async function lookupFirebaseUser(env: Env, idToken: string): Promise<FirebaseUserLookup> {
  const apiKey = env.FIREBASE_AUTH_API_KEY || env.FIREBASE_WEB_API_KEY;
  if (!apiKey) throw new Error('Firebase Authentication API belum dikonfigurasi.');
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  const result = await response.json() as { users?: FirebaseUserLookup[]; error?: { message?: string } };
  if (!response.ok || !result.users?.[0]?.localId) {
    throw new Error('Sesi Firebase tidak valid atau sudah kedaluwarsa. Masuk kembali ke SIPANDU.');
  }
  return result.users[0];
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary).replaceAll('=', '').split('+').join('-').split('/').join('_');
}

function encodeTextBase64Url(value: string): string {
  return encodeBase64Url(new TextEncoder().encode(value));
}

async function getGoogleAccessToken(env: Env, scope = 'https://www.googleapis.com/auth/identitytoolkit'): Promise<string> {
  const cached = cachedGoogleAccessTokens.get(scope);
  if (cached && Date.now() < cached.expiresAt - 60000) return cached.token;
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON || !env.FIREBASE_PROJECT_ID) {
    throw new Error('Kredensial administrator Firebase belum dipasang pada layanan pendaftaran.');
  }
  let serviceAccount: { project_id?: string; client_email?: string; private_key?: string };
  try {
    serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  } catch {
    throw new Error('Secret service account Firebase tidak berformat JSON yang benar.');
  }
  if (
    serviceAccount.project_id !== env.FIREBASE_PROJECT_ID ||
    !serviceAccount.client_email ||
    !serviceAccount.private_key
  ) {
    throw new Error('Service account Firebase tidak cocok dengan proyek SIPANDU atau belum lengkap.');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = encodeTextBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = encodeTextBase64Url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const signingInput = `${header}.${claims}`;
  const privateKeyBase64 = serviceAccount.private_key
    .replaceAll('-----BEGIN PRIVATE KEY-----', '')
    .replaceAll('-----END PRIVATE KEY-----', '')
    .split('\n').join('')
    .split('\r').join('')
    .split('\t').join('')
    .split(' ').join('');
  const privateKeyDer = Uint8Array.from(atob(privateKeyBase64), (char) => char.charCodeAt(0));
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(signingInput));
  const assertion = `${signingInput}.${encodeBase64Url(new Uint8Array(signature))}`;
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const tokenBody = await tokenResponse.json() as { access_token?: string; expires_in?: number };
  if (!tokenResponse.ok || !tokenBody.access_token) {
    throw new Error('Google tidak menerima kredensial layanan administrator Firebase.');
  }
  const token = tokenBody.access_token;
  cachedGoogleAccessTokens.set(scope, { token, expiresAt: Date.now() + Number(tokenBody.expires_in || 3600) * 1000 });
  return token;
}


async function checkFirebaseRoleAssignmentPermission(env: Env): Promise<{ status: 'checked'; granted: boolean } | { status: 'unavailable'; granted: null }> {
  try {
    if (!env.FIREBASE_PROJECT_ID) return { status: 'unavailable', granted: null };
    // Resource Manager testIamPermissions checks the service account behind this
    // secret without modifying a Firebase user or changing any custom claims.
    const accessToken = await getGoogleAccessToken(env, 'https://www.googleapis.com/auth/cloud-platform');
    const response = await fetch(
      `https://cloudresourcemanager.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}:testIamPermissions`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: ['firebaseauth.users.update'] }),
      },
    );
    if (!response.ok) return { status: 'unavailable', granted: null };
    const result = await response.json() as { permissions?: unknown };
    const granted = Array.isArray(result.permissions)
      && result.permissions.includes('firebaseauth.users.update');
    return { status: 'checked', granted };
  } catch {
    // Do not leak service-account details, access tokens, or upstream responses.
    return { status: 'unavailable', granted: null };
  }
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

async function sendSIPANDUEmail(
  env: Env,
  to: string,
  subject: string,
  title: string,
  message: string,
): Promise<boolean> {
  if (!env.RESEND_API_KEY || !env.SIPANDU_EMAIL_FROM || !to) return false;
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + env.RESEND_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.SIPANDU_EMAIL_FROM,
      to: [to],
      subject,
      text: title + '\n\n' + message,
      html: '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#17251a">'
        + '<h2>' + safeTitle + '</h2><p style="line-height:1.6">' + safeMessage + '</p>'
        + '<p style="font-size:12px;color:#647366">SIPANDU ODHIV · Pemberitahuan otomatis</p></div>',
    }),
  });
  return response.ok;
}

async function getActorRole(env: Env, idToken: string): Promise<{ user: FirebaseUserLookup; role: string }> {
  const user = await lookupFirebaseUser(env, idToken);
  let claims: Record<string, unknown> = {};
  if (user.customAttributes) {
    const parsed = JSON.parse(user.customAttributes) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Klaim akun tidak valid.');
    }
    claims = parsed as Record<string, unknown>;
  }
  return { user, role: String(claims.role || '') };
}

async function canApproveRegistration(
  env: Env,
  user: FirebaseUserLookup,
  role: string,
): Promise<boolean> {
  if (role === 'owner') return true;
  if (role !== 'supervisor' || !env.PENDING_REGISTRATIONS) return false;
  return Boolean(await env.PENDING_REGISTRATIONS.get('registration-approver:' + user.localId));
}

async function listKVKeys(
  kv: KVBinding,
  prefix: string,
  limit = 500,
): Promise<string[] | null> {
  if (!kv.list) return null;
  const result = await kv.list({ prefix, limit });
  return result.keys.map((item) => item.name);
}

async function lookupFirebaseUserByUid(env: Env, uid: string): Promise<FirebaseUserLookup> {
  if (!env.FIREBASE_PROJECT_ID) throw new Error('ID proyek Firebase belum dikonfigurasi.');
  const accessToken = await getGoogleAccessToken(env);
  const response = await fetch(
    'https://identitytoolkit.googleapis.com/v1/projects/' + encodeURIComponent(env.FIREBASE_PROJECT_ID) + '/accounts:lookup',
    {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ localId: [uid] }),
    },
  );
  const result = await response.json() as { users?: FirebaseUserLookup[] };
  if (!response.ok || !result.users?.[0]?.localId) throw new Error('Akun Firebase untuk UID tersebut tidak ditemukan.');
  return result.users[0];
}
const MAX_PUBLIC_STAGE_ONE_BODY_BYTES = 980_000;

function missingPublicStageOneConfiguration(env: Env): string[] {
  const missing: string[] = [];
  if (!env.TURNSTILE_SECRET_KEY) missing.push('TURNSTILE_SECRET_KEY');
  if (!env.FIREBASE_PROJECT_ID) missing.push('FIREBASE_PROJECT_ID');
  if (!env.FIREBASE_DATABASE_ID) missing.push('FIREBASE_DATABASE_ID');
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) missing.push('FIREBASE_SERVICE_ACCOUNT_JSON');
  if (!env.PENDING_REGISTRATIONS) missing.push('PENDING_REGISTRATIONS KV');
  return missing;
}

async function verifyPublicTurnstile(
  env: Env,
  token: string,
  request: Request,
): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY || !token || token.length > 2048) return false;
  const origin = request.headers.get('Origin');
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return false;
  const hostname = new URL(origin).hostname.toLowerCase();
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret: env.TURNSTILE_SECRET_KEY,
      response: token,
      remoteip: request.headers.get('CF-Connecting-IP') || undefined,
      idempotency_key: crypto.randomUUID(),
    }),
  });
  if (!response.ok) return false;
  const result = await response.json() as {
    success?: boolean;
    hostname?: string;
    action?: string;
  };
  return result.success === true
    && String(result.hostname || '').toLowerCase() === hostname
    && result.action === 'sipandu-stage-one';
}

function validPublicStageOnePayload(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  const photo = (item: unknown) => typeof item === 'string'
    && item.length > 20 && item.length <= 480_000
    && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(item);
  const timestamp = typeof data.timestamp === 'string' && Number.isFinite(Date.parse(data.timestamp));
  return timestamp
    && typeof data.namaLengkap === 'string' && data.namaLengkap.trim().length >= 2 && data.namaLengkap.length <= 120
    && typeof data.nik === 'string' && /^\d{16}$/.test(data.nik)
    && typeof data.usia === 'number' && Number.isInteger(data.usia) && data.usia >= 1 && data.usia <= 100
    && (data.jenisKelamin === 'Laki-laki' || data.jenisKelamin === 'Perempuan')
    && typeof data.kotaDomisili === 'string' && data.kotaDomisili.trim().length >= 2 && data.kotaDomisili.length <= 100
    && typeof data.alamatLengkap === 'string' && data.alamatLengkap.length <= 300
    && typeof data.noHpWa === 'string' && data.noHpWa.length >= 8 && data.noHpWa.length <= 25
    && typeof data.jenisBantuan === 'string' && data.jenisBantuan.trim().length > 0 && data.jenisBantuan.length <= 240
    && typeof data.intervensiMental === 'string' && data.intervensiMental.length <= 1000
    && typeof data.desil === 'number' && Number.isInteger(data.desil) && data.desil >= 0 && data.desil <= 10
    && data.statusAsesmen === 'Tahap Awal'
    && photo(data.fotoDiri) && photo(data.fotoKtp);
}

function firestoreString(value: unknown): { stringValue: string } {
  return { stringValue: String(value ?? '') };
}

async function createPublicStageOneDocument(env: Env, data: Record<string, unknown>): Promise<string> {
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_DATABASE_ID) {
    throw new Error('Proyek atau database Firestore belum dikonfigurasi.');
  }
  const id = crypto.randomUUID();
  const accessToken = await getGoogleAccessToken(env, 'https://www.googleapis.com/auth/datastore');
  const fields = {
    timestamp: firestoreString(data.timestamp),
    namaLengkap: firestoreString(data.namaLengkap),
    nik: firestoreString(data.nik),
    usia: { integerValue: String(data.usia) },
    jenisKelamin: firestoreString(data.jenisKelamin),
    kotaDomisili: firestoreString(data.kotaDomisili),
    alamatLengkap: firestoreString(data.alamatLengkap),
    noHpWa: firestoreString(data.noHpWa),
    jenisBantuan: firestoreString(data.jenisBantuan),
    intervensiMental: firestoreString(data.intervensiMental),
    desil: { integerValue: String(data.desil) },
    fotoDiri: firestoreString(data.fotoDiri),
    fotoKtp: firestoreString(data.fotoKtp),
    statusAsesmen: { stringValue: 'Tahap Awal' },
    source: { stringValue: 'respondent-link' },
    submittedAt: { timestampValue: new Date().toISOString() },
  };
  const url = 'https://firestore.googleapis.com/v1/projects/'
    + encodeURIComponent(env.FIREBASE_PROJECT_ID)
    + '/databases/' + encodeURIComponent(env.FIREBASE_DATABASE_ID)
    + '/documents/stageOneIntake?documentId=' + encodeURIComponent(id);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(error.error?.message || 'Firestore menolak penyimpanan asesmen tahap awal.');
  }
  return id;
}

async function assignBasicMemberRole(env: Env, user: FirebaseUserLookup): Promise<void> {
  if (!env.FIREBASE_PROJECT_ID) throw new Error('ID proyek Firebase belum dikonfigurasi.');
  let existingClaims: Record<string, unknown> = {};
  if (user.customAttributes) {
    try {
      const parsed = JSON.parse(user.customAttributes) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        existingClaims = parsed as Record<string, unknown>;
      }
    } catch {
      throw new Error('Klaim akun Firebase lama tidak dapat dibaca dengan aman.');
    }
  }
  const currentRole = existingClaims.role;
  if (currentRole === 'owner' || currentRole === 'supervisor' || currentRole === 'pendamping') {
    throw new Error('Peran staf yang sudah ada tidak dapat diubah melalui pendaftaran mandiri.');
  }
  if (currentRole !== undefined && currentRole !== 'anggota') {
    throw new Error('Akun memiliki peran yang tidak dapat ditimpa melalui pendaftaran mandiri.');
  }
  const accessToken = await getGoogleAccessToken(env);
  const customAttributes = JSON.stringify({ ...existingClaims, role: 'anggota' });
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/accounts:update`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ localId: user.localId, customAttributes }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as {
      error?: { message?: string; status?: string };
    };
    const firebaseError = `${body.error?.status || ''} ${body.error?.message || ''}`.trim();
    if (/INSUFFICIENT_PERMISSION|PERMISSION_DENIED|firebaseauth[.]users[.]update/i.test(firebaseError)) {
      throw new Error(
        'Service account Firebase pada Worker sipandu-registration belum memiliki izin IAM firebaseauth.users.update pada proyek gen-lang-client-0197631978. Berikan izin tersebut kepada email client_email di secret FIREBASE_SERVICE_ACCOUNT_JSON, lalu tekan Coba verifikasi akses lagi. Pengguna tidak perlu membuat akun baru.',
      );
    }
    throw new Error(body.error?.message || 'Firebase gagal menerapkan peran anggota pada akun.');
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return jsonResponse({ ok: false, message: 'Origin tidak diizinkan.' }, 403, null);
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const url = new URL(request.url);
    const path = url.pathname.length > 1 && url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname;

    const livenessUiHeaders = {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'camera=(self)',
      'Content-Security-Policy': "default-src 'none'; base-uri 'none'; object-src 'none'; script-src 'self' https://esm.sh https://cdn.liveness.rekognition.amazonaws.com; style-src 'self' 'unsafe-inline' https://esm.sh; img-src 'self' data: blob: https://cdn.liveness.rekognition.amazonaws.com; connect-src 'self' https://esm.sh https://cdn.liveness.rekognition.amazonaws.com https://*.amazonaws.com wss://*.amazonaws.com; worker-src 'self' blob: https://cdn.liveness.rekognition.amazonaws.com; media-src 'self' data: blob:; frame-ancestors https://sipandu.aryprayoga139.workers.dev https://sipanduodhiv.my.id https://localhost http://localhost http://localhost:3000 capacitor://localhost",
    };
    if (path === '/liveness/ui' && request.method === 'GET') {
      return new Response(LIVENESS_UI_HTML, {
        status: 200,
        headers: { ...livenessUiHeaders, 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
    if (path === '/liveness/ui.js' && request.method === 'GET') {
      return new Response(LIVENESS_UI_JS, {
        status: 200,
        headers: { ...livenessUiHeaders, 'Content-Type': 'text/javascript; charset=utf-8' },
      });
    }

    if (path === '/liveness/health' && request.method === 'GET') {
      const missing = missingLivenessConfiguration(env);
      return jsonResponse({
        ok: true,
        ready: missing.length === 0,
        region: livenessRegion(env),
        minimumConfidence: livenessConfidenceThreshold(env),
        consentVersion: env.LIVENESS_CONSENT_VERSION || '2026-11-16-v1',
        missing,
      }, 200, origin);
    }

    if (path === '/liveness/session' && request.method === 'POST') {
      if (!(await allowAttempt(env, request, 5))) {
        return jsonResponse({ ok: false, message: 'Terlalu banyak percobaan verifikasi wajah. Coba kembali satu menit lagi.' }, 429, origin);
      }
      let applicant: FirebaseUserLookup;
      try { applicant = await lookupLivenessApplicant(env, request); }
      catch (error) {
        return jsonResponse({ ok: false, message: error instanceof Error ? error.message : 'Identitas pendaftar belum dapat diverifikasi.' }, 401, origin);
      }
      const missing = missingLivenessConfiguration(env);
      if (missing.length) {
        return jsonResponse({ ok: false, code: 'LIVENESS_NOT_CONFIGURED', missing, message: 'Verifikasi wajah belum dapat digunakan karena layanan AWS belum dikonfigurasi administrator.' }, 503, origin);
      }
      const body = await parseJson(request);
      const consentVersion = env.LIVENESS_CONSENT_VERSION || '2026-11-16-v1';
      if (body?.consentVersion !== consentVersion) {
        return jsonResponse({ ok: false, code: 'LIVENESS_CONSENT_REQUIRED', message: 'Persetujuan pemrosesan video wajah belum diberikan atau sudah berubah.' }, 400, origin);
      }
      try {
        const challengeId = crypto.randomUUID();
        const created = await rekognitionRequest<{ SessionId?: string }>(env, 'CreateFaceLivenessSession', {
          ClientRequestToken: challengeId,
          Settings: { AuditImagesLimit: 0 },
        });
        if (!created.SessionId) throw new Error('AWS tidak mengembalikan ID sesi pemeriksaan wajah.');
        const now = Date.now();
        await callLivenessStore(env, challengeId, 'create', {
          challengeId,
          uid: applicant.localId,
          sessionId: created.SessionId,
          consentVersion,
          consentAcceptedAt: now,
          createdAt: now,
          expiresAt: now + 10 * 60 * 1000,
        });
        return jsonResponse({
          ok: true,
          challengeId,
          sessionId: created.SessionId,
          region: livenessRegion(env),
          expiresInSeconds: 600,
        }, 201, origin);
      } catch (error) {
        return jsonResponse({ ok: false, message: error instanceof Error ? error.message : 'Sesi liveness belum dapat dibuat.' }, 502, origin);
      }
    }

    if (path === '/liveness/credentials' && request.method === 'POST') {
      if (!(await allowAttempt(env, request, 10)) ) {
        return jsonResponse({ ok: false, message: 'Terlalu banyak permintaan kredensial verifikasi. Coba kembali sebentar lagi.' }, 429, origin);
      }
      let applicant: FirebaseUserLookup;
      try { applicant = await lookupLivenessApplicant(env, request); }
      catch (error) {
        return jsonResponse({ ok: false, message: error instanceof Error ? error.message : 'Identitas pendaftar belum dapat diverifikasi.' }, 401, origin);
      }
      const body = await parseJson(request);
      const challengeId = typeof body?.challengeId === 'string' ? body.challengeId : '';
      if (!/^[0-9a-f-]{36}$/i.test(challengeId)) return jsonResponse({ ok: false, message: 'ID sesi liveness tidak valid.' }, 400, origin);
      try {
        await callLivenessStore(env, challengeId, 'credentials', { uid: applicant.localId });
        const credentials = await assumeLivenessStreamingRole(env);
        return jsonResponse({ ok: true, credentials }, 200, origin);
      } catch (error) {
        return jsonResponse({ ok: false, message: error instanceof Error ? error.message : 'Kredensial streaming sementara belum dapat diterbitkan.' }, 403, origin);
      }
    }

    if (path === '/liveness/verify' && request.method === 'POST') {
      if (!(await allowAttempt(env, request, 30))) {
        return jsonResponse({ ok: false, message: 'Terlalu banyak permintaan pemeriksaan hasil. Coba kembali sebentar lagi.' }, 429, origin);
      }
      let applicant: FirebaseUserLookup;
      try { applicant = await lookupLivenessApplicant(env, request); }
      catch (error) {
        return jsonResponse({ ok: false, message: error instanceof Error ? error.message : 'Identitas pendaftar belum dapat diverifikasi.' }, 401, origin);
      }
      const body = await parseJson(request);
      const challengeId = typeof body?.challengeId === 'string' ? body.challengeId : '';
      if (!/^[0-9a-f-]{36}$/i.test(challengeId)) return jsonResponse({ ok: false, message: 'ID sesi liveness tidak valid.' }, 400, origin);
      try {
        const state = await callLivenessStore(env, challengeId, 'verify-start', { uid: applicant.localId });
        const result = await rekognitionRequest<{ Status?: string; Confidence?: number }>(
          env,
          'GetFaceLivenessSessionResults',
          { SessionId: state.record?.sessionId },
        );
        if (result.Status === 'IN_PROGRESS') {
          return jsonResponse({ ok: true, status: 'in_progress', message: 'Analisis liveness masih diproses.' }, 202, origin);
        }
        if (result.Status !== 'SUCCEEDED' || typeof result.Confidence !== 'number') {
          await callLivenessStore(env, challengeId, 'verify-complete', { uid: applicant.localId, passed: false });
          return jsonResponse({ ok: false, status: 'failed', message: 'Pemeriksaan wajah tidak berhasil. Silakan ulangi dengan sesi baru.' }, 403, origin);
        }
        const threshold = livenessConfidenceThreshold(env);
        const passed = result.Confidence >= threshold;
        const proofToken = passed ? crypto.randomUUID() : '';
        await callLivenessStore(env, challengeId, 'verify-complete', {
          uid: applicant.localId,
          passed,
          confidence: result.Confidence,
          proofToken,
          proofExpiresAt: Date.now() + 10 * 60 * 1000,
        });
        if (!passed) {
          return jsonResponse({
            ok: false,
            status: 'failed',
            confidence: Math.round(result.Confidence * 100) / 100,
            minimumConfidence: threshold,
            message: 'Pemeriksaan liveness belum memenuhi ambang keamanan. Silakan ulangi dengan pencahayaan dan posisi wajah yang baik.',
          }, 403, origin);
        }
        return jsonResponse({
          ok: true,
          status: 'passed',
          proofToken: `${challengeId}.${proofToken}`,
          confidence: Math.round(result.Confidence * 100) / 100,
          message: 'Pemeriksaan wajah hidup berhasil. Anda dapat melanjutkan pendaftaran.',
        }, 200, origin);
      } catch (error) {
        return jsonResponse({ ok: false, message: error instanceof Error ? error.message : 'Hasil liveness belum dapat diverifikasi.' }, 409, origin);
      }
    }

    if (path === '/health' && request.method === 'GET') {
      const missing = missingConfiguration(env);
      const livenessMissing = missingLivenessConfiguration(env);
      return jsonResponse({
        ok: true,
        ready: missing.length === 0,
        missing,
        liveness: { ready: livenessMissing.length === 0, missing: livenessMissing, region: livenessRegion(env) },
      }, 200, origin);
    }


    if (path === '/registration-status' && request.method === 'POST') {
      const authorization = request.headers.get('Authorization') || '';
      const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
      if (!idToken) return jsonResponse({ ok: false, message: 'Sesi Firebase tidak ditemukan.' }, 401, origin);
      try {
        const user = await lookupFirebaseUser(env, idToken);
        const raw = await env.PENDING_REGISTRATIONS?.get('pending:' + user.localId);
        if (!raw) return jsonResponse({ ok: true, status: 'not_registered', message: 'Permohonan pendaftaran belum tercatat.' }, 200, origin);
        const record = JSON.parse(raw) as Record<string, unknown>;
        return jsonResponse({
          ok: true,
          status: String(record.status || 'pending_email'),
          message: record.status === 'rejected'
            ? 'Pendaftaran ditolak. Silakan hubungi administrator SIPANDU.'
            : record.status === 'active'
              ? 'Akun SIPANDU sudah aktif.'
              : record.status === 'pending_owner' || record.status === 'approved' || record.status === 'pending_email'
                ? 'Pendaftaran tercatat. Verifikasi email untuk mengaktifkan akun anggota.'
                : 'Status pendaftaran berhasil diperiksa.',
        }, 200, origin);
      } catch {
        return jsonResponse({ ok: false, message: 'Sesi Firebase tidak valid.' }, 401, origin);
      }
    }

    if (path === '/activation-diagnostics' && request.method === 'POST') {
      if (env.PENDING_REGISTRATIONS && !(await allowAttempt(env, request, 8))) {
        return jsonResponse({ ok: false, message: 'Terlalu banyak pemeriksaan aktivasi. Coba kembali setelah satu menit.' }, 429, origin);
      }
      const authorization = request.headers.get('Authorization') || '';
      const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
      if (!idToken) return jsonResponse({ ok: false, message: 'Sesi Firebase tidak ditemukan.' }, 401, origin);
      try {
        const user = await lookupFirebaseUser(env, idToken);
        const missing = missingActivationConfiguration(env);
        if (missing.length) {
          return jsonResponse({
            ok: true,
            accountEmailVerified: user.emailVerified === true,
            accountEnabled: user.disabled !== true,
            configurationReady: false,
            missing,
            permissionCheckStatus: 'skipped',
            roleUpdatePermission: null,
          }, 200, origin);
        }
        const permission = await checkFirebaseRoleAssignmentPermission(env);
        return jsonResponse({
          ok: true,
          accountEmailVerified: user.emailVerified === true,
          accountEnabled: user.disabled !== true,
          configurationReady: true,
          missing: [],
          permissionCheckStatus: permission.status,
          roleUpdatePermission: permission.granted,
          message: permission.status === 'checked'
            ? permission.granted
              ? 'Konfigurasi tersedia dan izin firebaseauth.users.update terdeteksi.'
              : 'Service account Worker belum memiliki izin IAM firebaseauth.users.update pada proyek Firebase.'
            : 'Konfigurasi tersedia, tetapi pemeriksaan izin IAM Google belum dapat diselesaikan.',
        }, 200, origin);
      } catch {
        return jsonResponse({ ok: false, message: 'Sesi Firebase tidak valid atau sudah kedaluwarsa.' }, 401, origin);
      }
    }

    if (path === '/owner/pending' && request.method === 'GET') {
      const authorization = request.headers.get('Authorization') || '';
      const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
      if (!idToken) return jsonResponse({ ok: false, message: 'Sesi administrator tidak ditemukan.' }, 401, origin);
      try {
        const actor = await getActorRole(env, idToken);
        if (!(await canApproveRegistration(env, actor.user, actor.role))) {
          return jsonResponse({ ok: false, message: 'Hanya Owner atau Supervisor yang ditunjuk Owner yang dapat melihat permohonan.' }, 403, origin);
        }
        if (!env.PENDING_REGISTRATIONS) return jsonResponse({ ok: false, message: 'Penyimpanan permohonan belum dikonfigurasi.' }, 503, origin);
        const keys = await listKVKeys(env.PENDING_REGISTRATIONS, 'pending:');
        if (!keys) return jsonResponse({ ok: false, message: 'KV belum mendukung daftar permohonan.' }, 503, origin);
        const records = await Promise.all(keys.map(async (key) => {
          const raw = await env.PENDING_REGISTRATIONS!.get(key);
          if (!raw) return null;
          try {
            const item = JSON.parse(raw) as Record<string, unknown>;
            if (item.status !== 'pending_owner') return null;
            return {
              uid: String(item.uid || key.slice('pending:'.length)),
              email: String(item.email || ''),
              name: String(item.name || ''),
              createdAt: Number(item.createdAt || 0),
              status: 'pending_owner',
            };
          } catch { return null; }
        }));
        return jsonResponse({ ok: true, items: records.filter(Boolean) }, 200, origin);
      } catch (error) {
        return jsonResponse({ ok: false, message: error instanceof Error ? error.message : 'Permohonan belum dapat dimuat.' }, 401, origin);
      }
    }

    if (path === '/owner/delegates' && request.method === 'GET') {
      const authorization = request.headers.get('Authorization') || '';
      const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
      if (!idToken) return jsonResponse({ ok: false, message: 'Sesi Owner tidak ditemukan.' }, 401, origin);
      try {
        const actor = await getActorRole(env, idToken);
        if (actor.role !== 'owner') return jsonResponse({ ok: false, message: 'Hanya Owner yang dapat mengelola delegasi persetujuan.' }, 403, origin);
        if (!env.PENDING_REGISTRATIONS) return jsonResponse({ ok: false, message: 'Penyimpanan delegasi belum dikonfigurasi.' }, 503, origin);
        const keys = await listKVKeys(env.PENDING_REGISTRATIONS, 'registration-approver:');
        if (!keys) return jsonResponse({ ok: false, message: 'KV belum mendukung daftar delegasi.' }, 503, origin);
        const delegates = await Promise.all(keys.map(async (key) => {
          const raw = await env.PENDING_REGISTRATIONS!.get(key);
          if (!raw) return null;
          try { return JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
        }));
        return jsonResponse({ ok: true, delegates: delegates.filter(Boolean) }, 200, origin);
      } catch (error) {
        return jsonResponse({ ok: false, message: error instanceof Error ? error.message : 'Delegasi belum dapat dimuat.' }, 401, origin);
      }
    }

    if (path === '/owner/delegates' && request.method === 'POST') {
      const body = await parseJson(request);
      const targetUid = typeof body?.uid === 'string' ? body.uid.trim() : '';
      const enabled = body?.enabled === true;
      if (!targetUid || targetUid.length > 128 || targetUid.includes('/') || targetUid.includes('\\') || /\s/.test(targetUid)) {
        return jsonResponse({ ok: false, message: 'UID Supervisor tidak valid.' }, 400, origin);
      }
      const authorization = request.headers.get('Authorization') || '';
      const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
      if (!idToken) return jsonResponse({ ok: false, message: 'Sesi Owner tidak ditemukan.' }, 401, origin);
      try {
        const actor = await getActorRole(env, idToken);
        if (actor.role !== 'owner') return jsonResponse({ ok: false, message: 'Hanya Owner yang dapat mengatur delegasi persetujuan.' }, 403, origin);
        if (!env.PENDING_REGISTRATIONS) return jsonResponse({ ok: false, message: 'Penyimpanan delegasi belum dikonfigurasi.' }, 503, origin);
        const key = 'registration-approver:' + targetUid;
        if (enabled) {
          const targetTokenUser = await lookupFirebaseUserByUid(env, targetUid);
          let targetClaims: Record<string, unknown> = {};
          try { targetClaims = targetTokenUser.customAttributes ? JSON.parse(targetTokenUser.customAttributes) as Record<string, unknown> : {}; } catch {
            return jsonResponse({ ok: false, message: 'Klaim Supervisor tidak dapat diverifikasi.' }, 409, origin);
          }
          if (targetClaims.role !== 'supervisor') {
            return jsonResponse({ ok: false, message: 'Delegasi hanya dapat diberikan kepada akun yang sudah memiliki peran Supervisor.' }, 400, origin);
          }
          await env.PENDING_REGISTRATIONS.put(key, JSON.stringify({
            uid: targetUid,
            email: String(targetTokenUser.email || ''),
            assignedAt: Date.now(),
            assignedByUid: actor.user.localId,
          }));
          return jsonResponse({ ok: true, enabled: true, message: 'Supervisor berhasil diberi kewenangan persetujuan.' }, 200, origin);
        }
        await env.PENDING_REGISTRATIONS.delete(key);
        return jsonResponse({ ok: true, enabled: false, message: 'Kewenangan persetujuan Supervisor berhasil dicabut.' }, 200, origin);
      } catch (error) {
        return jsonResponse({ ok: false, message: error instanceof Error ? error.message : 'Delegasi belum dapat diperbarui.' }, 403, origin);
      }
    }
    if (path === '/public-stage-one-intake' && request.method === 'POST') {
      if (!(await allowAttempt(env, request, 5))) {
        return jsonResponse({ ok: false, message: 'Terlalu banyak pengiriman dari jaringan ini. Coba kembali satu menit lagi.' }, 429, origin);
      }
      const missing = missingPublicStageOneConfiguration(env);
      if (missing.length) {
        return jsonResponse({ ok: false, message: 'Formulir publik belum dikonfigurasi sepenuhnya oleh administrator.' }, 503, origin);
      }
      const body = await parseJson(request, MAX_PUBLIC_STAGE_ONE_BODY_BYTES);
      const token = typeof body?.turnstileToken === 'string' ? body.turnstileToken : '';
      const payload = body?.payload;
      if (!validPublicStageOnePayload(payload)) {
        return jsonResponse({ ok: false, message: 'Data formulir atau foto tidak lengkap atau tidak valid.' }, 400, origin);
      }
      try {
        if (!(await verifyPublicTurnstile(env, token, request))) {
          return jsonResponse({ ok: false, message: 'Verifikasi keamanan gagal atau kedaluwarsa. Selesaikan pemeriksaan keamanan lalu kirim kembali.' }, 403, origin);
        }
        const id = await createPublicStageOneDocument(env, payload);
        return jsonResponse({ ok: true, id, message: 'Asesmen tahap awal berhasil dikirim.' }, 201, origin);
      } catch (error) {
        return jsonResponse({ ok: false, message: error instanceof Error ? error.message : 'Data asesmen belum dapat disimpan.' }, 502, origin);
      }
    }

    if (path === '/register' && request.method === 'POST') {
      if (!(await allowAttempt(env, request))) {
        return jsonResponse({ ok: false, message: 'Terlalu banyak percobaan. Coba kembali setelah satu menit.' }, 429, origin);
      }
      if (missingConfiguration(env).length) {
        return jsonResponse({ ok: false, message: 'Layanan pendaftaran belum siap digunakan administrator.' }, 503, origin);
      }
      const authorization = request.headers.get('Authorization') || '';
      const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
      if (!idToken) return jsonResponse({ ok: false, message: 'Sesi Firebase tidak ditemukan.' }, 401, origin);
      try {
        const firebaseUser = await lookupFirebaseUser(env, idToken);
        if (!firebaseUser.email || !firebaseUser.localId || firebaseUser.emailVerified) {
          return jsonResponse({ ok: false, message: 'Pendaftaran baru memerlukan akun dengan email valid yang belum diverifikasi.' }, 400, origin);
        }
        if (firebaseUser.disabled) {
          return jsonResponse({ ok: false, message: 'Akun SIPANDU telah dinonaktifkan administrator.' }, 403, origin);
        }

        let claims: Record<string, unknown> = {};
        try {
          claims = firebaseUser.customAttributes ? JSON.parse(firebaseUser.customAttributes) as Record<string, unknown> : {};
          if (!claims || typeof claims !== 'object' || Array.isArray(claims)) throw new Error('Invalid claims');
        } catch {
          return jsonResponse({ ok: false, message: 'Klaim akun Firebase tidak dapat dibaca dengan aman.' }, 409, origin);
        }
        if (claims.role === 'owner' || claims.role === 'supervisor' || claims.role === 'pendamping' || claims.role === 'anggota') {
          return jsonResponse({ ok: false, status: 'active', message: 'Akun ini sudah memiliki peran SIPANDU.' }, 409, origin);
        }
        if (claims.role !== undefined && claims.role !== null && claims.role !== '') {
          return jsonResponse({ ok: false, message: 'Akun memiliki peran yang tidak dapat ditimpa melalui pendaftaran mandiri.' }, 403, origin);
        }

        const registrationBody = await parseJson(request);
        const livenessProofToken = typeof registrationBody?.livenessProofToken === 'string'
          ? registrationBody.livenessProofToken.trim()
          : '';
        const key = `pending:${firebaseUser.localId}`;
        const existing = await env.PENDING_REGISTRATIONS!.get(key);
        let prior: Record<string, unknown> = {};
        if (existing) {
          try { prior = JSON.parse(existing) as Record<string, unknown>; } catch {
            return jsonResponse({ ok: false, message: 'Data pendaftaran lama tidak valid. Hubungi administrator.' }, 409, origin);
          }
          if (prior.uid && prior.uid !== firebaseUser.localId) {
            return jsonResponse({ ok: false, message: 'Data pendaftaran tidak cocok dengan akun Firebase.' }, 409, origin);
          }
          if (prior.status === 'rejected') {
            return jsonResponse({ ok: false, status: 'rejected', message: 'Pendaftaran akun ini pernah ditolak. Hubungi administrator SIPANDU.' }, 403, origin);
          }
          if (prior.status === 'active') {
            return jsonResponse({ ok: true, status: 'active', message: 'Akun SIPANDU sudah aktif.' }, 200, origin);
          }
        }

        const legacyAccount = await isLegacyRegistrationAccount(env, firebaseUser);
        const hasPriorRegistration = Boolean(existing && prior.registrationMode === 'self-service'
          && (prior.status === 'pending_email' || prior.status === 'approved'));
        let livenessEvidence: Record<string, unknown> | null = null;
        if (!hasPriorRegistration && !legacyAccount) {
          if (!livenessProofToken) {
            return jsonResponse({
              ok: false,
              code: 'LIVENESS_REQUIRED',
              message: 'Pemeriksaan wajah hidup wajib diselesaikan sebelum pendaftaran mandiri dapat dicatat.',
            }, 403, origin);
          }
          const proofParts = livenessProofToken.split('.');
          if (proofParts.length !== 2 || !proofParts.every((part) => /^[0-9a-f-]{36}$/i.test(part))) {
            return jsonResponse({ ok: false, code: 'LIVENESS_PROOF_INVALID', message: 'Bukti liveness tidak valid. Ulangi pemeriksaan wajah.' }, 403, origin);
          }
          try {
            const consumed = await callLivenessStore(env, proofParts[0], 'consume-proof', { uid: firebaseUser.localId, proofToken: proofParts[1] });
            const evidence = consumed.record;
            if (!evidence || evidence.status !== 'passed') throw new Error('Bukti liveness belum lulus.');
            livenessEvidence = {
              provider: 'amazon-rekognition-face-liveness',
              region: livenessRegion(env),
              status: 'passed',
              confidence: evidence.confidence,
              verifiedAt: evidence.proofExpiresAt ? evidence.proofExpiresAt - 10 * 60 * 1000 : Date.now(),
              consentVersion: evidence.consentVersion,
              consentAcceptedAt: evidence.consentAcceptedAt,
            };
          } catch {
            return jsonResponse({ ok: false, code: 'LIVENESS_PROOF_INVALID', message: 'Bukti liveness telah digunakan, kedaluwarsa, atau tidak cocok. Ulangi pemeriksaan wajah.' }, 403, origin);
          }
        }

        const now = Date.now();
        await env.PENDING_REGISTRATIONS!.put(key, JSON.stringify({
          ...prior,
          ...(livenessEvidence ? { liveness: livenessEvidence } : legacyAccount ? { liveness: { status: 'legacy_exempt', reason: 'account_created_before_liveness_enforcement' } } : {}),
          uid: firebaseUser.localId,
          email: firebaseUser.email.trim().toLowerCase(),
          name: String(firebaseUser.displayName || prior.name || ''),
          createdAt: Number(prior.createdAt || now),
          registrationMode: 'self-service',
          status: 'pending_email',
          updatedAt: now,
        }), { expirationTtl: 30 * 24 * 60 * 60 });

        return jsonResponse({
          ok: true,
          status: 'pending_email',
          message: 'Pendaftaran berhasil dicatat. Verifikasi email melalui tautan Firebase untuk mengaktifkan akun anggota dengan hak dasar.',
        }, 202, origin);
      } catch (error) {
        return jsonResponse({ ok: false, message: error instanceof Error ? error.message : 'Sesi akun tidak dapat diverifikasi.' }, 401, origin);
      }
    }

    if (path === '/restore-invitation' && request.method === 'POST') {
      if (!(await allowAttempt(env, request))) {
        return jsonResponse({ ok: false, message: 'Terlalu banyak percobaan. Coba kembali setelah satu menit.' }, 429, origin);
      }
      const missing = missingActivationConfiguration(env);
      if (missing.length) {
        return jsonResponse({ ok: false, message: `Layanan pemulihan undangan belum siap. Konfigurasi belum tersedia: ${missing.join(', ')}.`, missing }, 503, origin);
      }
      const authorization = request.headers.get('Authorization') || '';
      const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
      if (!idToken) return jsonResponse({ ok: false, message: 'Sesi Firebase tidak ditemukan.' }, 401, origin);
      try {
        const firebaseUser = await lookupFirebaseUser(env, idToken);
        if (!firebaseUser.email || !firebaseUser.localId) {
          return jsonResponse({ ok: false, message: 'Profil akun Firebase belum lengkap.' }, 400, origin);
        }
        if (!firebaseUser.emailVerified) {
          return jsonResponse({ ok: false, message: 'Email belum diverifikasi. Pulihkan undangan setelah verifikasi email selesai.' }, 403, origin);
        }

        let existingClaims: Record<string, unknown> = {};
        if (firebaseUser.customAttributes) {
          try {
            const parsed = JSON.parse(firebaseUser.customAttributes) as unknown;
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
              throw new Error('Klaim akun tidak valid.');
            }
            existingClaims = parsed as Record<string, unknown>;
          } catch {
            return jsonResponse({ ok: false, message: 'Klaim akun Firebase tidak dapat dibaca dengan aman.' }, 403, origin);
          }
        }
        const currentRole = existingClaims.role;
        if (currentRole === 'owner' || currentRole === 'supervisor') {
          return jsonResponse({ ok: false, message: 'Akun ini sudah memiliki peran administrator. Pemulihan undangan anggota tidak diperlukan.' }, 409, origin);
        }
        if (currentRole !== undefined && currentRole !== 'pendamping') {
          return jsonResponse({ ok: false, message: 'Akun memiliki peran yang tidak dapat ditimpa melalui pemulihan undangan.' }, 403, origin);
        }

        const pendingKey = `pending:${firebaseUser.localId}`;
        const pendingRaw = await env.PENDING_REGISTRATIONS!.get(pendingKey);
        if (!pendingRaw) {
          return jsonResponse({ ok: false, message: 'Permohonan belum tercatat. Daftarkan ulang dan tunggu persetujuan Owner.' }, 404, origin);
        }
        let pending: Record<string, unknown>;
        try { pending = JSON.parse(pendingRaw) as Record<string, unknown>; } catch {
          return jsonResponse({ ok: false, message: 'Data permohonan tidak valid. Hubungi administrator.' }, 409, origin);
        }
        if (pending.status !== 'approved' && pending.status !== 'pending_email') {
          return jsonResponse({ ok: false, status: pending.status || 'pending_owner', message: pending.status === 'rejected' ? 'Permohonan pendaftaran ditolak oleh Owner.' : 'Permohonan masih menunggu persetujuan Owner.' }, 403, origin);
        }
        const now = Date.now();
        await env.PENDING_REGISTRATIONS!.put(pendingKey, JSON.stringify({
          ...pending,
          email: firebaseUser.email.trim().toLowerCase(),
          status: 'pending_email',
          emailVerifiedAt: now,
          restoredAt: now,
        }), { expirationTtl: 7 * 24 * 60 * 60 });
        return jsonResponse({ ok: true, status: 'pending_email', message: 'Permohonan telah disetujui. Verifikasi email dapat dilanjutkan.' }, 200, origin);
      } catch (error) {
        return jsonResponse({ ok: false, message: error instanceof Error ? error.message : 'Undangan tim belum dapat dipulihkan.' }, 401, origin);
      }
    }

    if ((path === '/owner/approve' || path === '/owner/reject') && request.method === 'POST') {
      if (!(await allowAttempt(env, request, 20))) {
        return jsonResponse({ ok: false, message: 'Terlalu banyak keputusan. Coba kembali satu menit lagi.' }, 429, origin);
      }
      const body = await parseJson(request);
      const targetUid = typeof body?.uid === 'string' ? body.uid.trim() : '';
      if (!targetUid || targetUid.length > 128 || targetUid.includes('/') || targetUid.includes(String.fromCharCode(92)) || [...targetUid].some((char) => char.charCodeAt(0) <= 32)) {
        return jsonResponse({ ok: false, message: 'UID pendaftar tidak valid.' }, 400, origin);
      }
      const authorization = request.headers.get('Authorization') || '';
      const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
      if (!idToken) return jsonResponse({ ok: false, message: 'Sesi administrator tidak ditemukan.' }, 401, origin);
      try {
        const actor = await lookupFirebaseUser(env, idToken);
        let actorClaims: Record<string, unknown> = {};
        try { actorClaims = actor.customAttributes ? JSON.parse(actor.customAttributes) as Record<string, unknown> : {}; } catch {
          return jsonResponse({ ok: false, message: 'Klaim administrator tidak valid.' }, 403, origin);
        }
        if (!(await canApproveRegistration(env, actor, String(actorClaims.role || '')))) {
          return jsonResponse({ ok: false, message: 'Hanya Owner atau Supervisor yang ditunjuk secara khusus oleh Owner yang dapat memutuskan pendaftaran.' }, 403, origin);
        }
        const key = `pending:${targetUid}`;
        const raw = await env.PENDING_REGISTRATIONS?.get(key);
        if (!raw) return jsonResponse({ ok: false, message: 'Permohonan pendaftaran tidak ditemukan atau sudah kedaluwarsa.' }, 404, origin);
        let pending: Record<string, unknown>;
        try { pending = JSON.parse(raw) as Record<string, unknown>; } catch {
          return jsonResponse({ ok: false, message: 'Data permohonan tidak valid.' }, 409, origin);
        }
        if (pending.uid !== targetUid || pending.status !== 'pending_owner') {
          return jsonResponse({ ok: false, message: 'Permohonan sudah diputuskan atau tidak cocok.' }, 409, origin);
        }
        const approved = path === '/owner/approve';
        await env.PENDING_REGISTRATIONS!.put(key, JSON.stringify({
          ...pending,
          status: approved ? 'approved' : 'rejected',
          decidedAt: Date.now(),
          decidedByUid: actor.localId,
        }), { expirationTtl: 7 * 24 * 60 * 60 });
        const emailNotificationSent = await sendSIPANDUEmail(
          env,
          String(pending.email || ''),
          approved ? 'Pendaftaran SIPANDU disetujui' : 'Informasi hasil pendaftaran SIPANDU',
          approved ? 'Permohonan Anda disetujui' : 'Permohonan pendaftaran belum dapat disetujui',
          approved
            ? 'Permohonan Anda telah disetujui. Silakan kembali ke halaman login SIPANDU dan masuk menggunakan email serta kata sandi saat mendaftar. SIPANDU akan mengirim tautan verifikasi email ketika Anda mencoba masuk setelah persetujuan ini.'
            : 'Mohon maaf, permohonan pendaftaran SIPANDU Anda belum dapat disetujui. Silakan hubungi administrator SIPANDU untuk informasi lebih lanjut.',
        ).catch(() => false);
        return jsonResponse({
          ok: true,
          status: approved ? 'approved' : 'rejected',
          emailNotificationSent,
          message: approved
            ? 'Pendaftaran disetujui. Pendaftar dapat masuk untuk menerima tautan verifikasi email.'
            : 'Pendaftaran ditolak. Akun tidak dapat diaktifkan.',
        }, 200, origin);
      } catch (error) {
        return jsonResponse({ ok: false, message: error instanceof Error ? error.message : 'Keputusan pendaftaran gagal diproses.' }, 401, origin);
      }
    }

    if (path === '/activate' && request.method === 'POST') {
      const activationMissing = missingActivationConfiguration(env);
      if (activationMissing.length) {
        return jsonResponse({
          ok: false,
          message: `Layanan aktivasi belum siap. Konfigurasi belum tersedia: ${activationMissing.join(', ')}.`,
          missing: activationMissing,
        }, 503, origin);
      }
      if (env.PENDING_REGISTRATIONS && !(await allowAttempt(env, request, 12))) {
        return jsonResponse({ ok: false, message: 'Terlalu banyak percobaan aktivasi. Coba kembali setelah satu menit.' }, 429, origin);
      }
      const authorization = request.headers.get('Authorization') || '';
      const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
      if (!idToken) return jsonResponse({ ok: false, message: 'Sesi Firebase tidak ditemukan.' }, 401, origin);
      try {
        const firebaseUser = await lookupFirebaseUser(env, idToken);
        if (!firebaseUser.localId || !firebaseUser.email) {
          return jsonResponse({ ok: false, message: 'Akun Firebase belum memiliki email yang valid.' }, 400, origin);
        }
        if (firebaseUser.disabled) {
          return jsonResponse({ ok: false, message: 'Akun SIPANDU telah dinonaktifkan administrator. Hubungi administrator untuk pemulihan akses.' }, 403, origin);
        }
        if (!firebaseUser.emailVerified) {
          return jsonResponse({ ok: false, message: 'Email belum diverifikasi. Buka tautan verifikasi terlebih dahulu.' }, 403, origin);
        }

        let existingClaims: Record<string, unknown> = {};
        try {
          existingClaims = firebaseUser.customAttributes ? JSON.parse(firebaseUser.customAttributes) as Record<string, unknown> : {};
          if (!existingClaims || typeof existingClaims !== 'object' || Array.isArray(existingClaims)) throw new Error('Invalid claims');
        } catch {
          return jsonResponse({ ok: false, message: 'Klaim akun tidak dapat dibaca dengan aman.' }, 403, origin);
        }
        if (existingClaims.role === 'owner' || existingClaims.role === 'supervisor'
          || existingClaims.role === 'pendamping' || existingClaims.role === 'anggota') {
          return jsonResponse({ ok: true, status: 'active', message: 'Akun SIPANDU yang sudah aktif dipertahankan.' }, 200, origin);
        }
        if (existingClaims.role !== undefined && existingClaims.role !== null && existingClaims.role !== '') {
          return jsonResponse({ ok: false, message: 'Peran akun yang sudah ada tidak dapat ditimpa melalui aktivasi mandiri.' }, 403, origin);
        }
        if (!env.PENDING_REGISTRATIONS) {
          return jsonResponse({ ok: false, message: 'Catatan pendaftaran anggota belum tersedia.' }, 503, origin);
        }

        const pendingKey = `pending:${firebaseUser.localId}`;
        const pendingRaw = await env.PENDING_REGISTRATIONS.get(pendingKey);
        if (!pendingRaw) {
          return jsonResponse({ ok: false, message: 'Pendaftaran belum tercatat. Daftar kembali sebelum aktivasi.' }, 403, origin);
        }
        let pending: Record<string, unknown>;
        try { pending = JSON.parse(pendingRaw) as Record<string, unknown>; } catch {
          return jsonResponse({ ok: false, message: 'Data pendaftaran tidak valid. Hubungi administrator.' }, 409, origin);
        }
        if (pending.uid !== firebaseUser.localId
          || String(pending.email || '').trim().toLowerCase() !== firebaseUser.email.trim().toLowerCase()) {
          return jsonResponse({ ok: false, message: 'Identitas pendaftaran tidak cocok dengan akun Firebase yang diverifikasi.' }, 403, origin);
        }
        // approved is accepted only to let legacy Owner-approved registrations finish safely.
        if (pending.status !== 'pending_email' && pending.status !== 'approved') {
          const message = pending.status === 'rejected'
            ? 'Pendaftaran akun ditolak administrator. Hubungi administrator SIPANDU.'
            : 'Pendaftaran belum siap diaktifkan. Kirim pendaftaran mandiri terlebih dahulu.';
          return jsonResponse({ ok: false, status: String(pending.status || 'not_registered'), message }, 403, origin);
        }

        await assignBasicMemberRole(env, firebaseUser);
        await env.PENDING_REGISTRATIONS.put(pendingKey, JSON.stringify({
          ...pending,
          status: 'active',
          activatedAt: Date.now(),
        }), { expirationTtl: 365 * 24 * 60 * 60 });
        return jsonResponse({
          ok: true,
          status: 'active',
          role: 'anggota',
          message: 'Email berhasil diverifikasi. Akun SIPANDU aktif sebagai anggota dengan hak dasar.',
        }, 200, origin);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Aktivasi akun belum berhasil.';
        const permissionFailure = /INSUFFICIENT_PERMISSION|PERMISSION_DENIED|firebaseauth[.]users[.]update/i.test(message);
        return jsonResponse({ ok: false, message }, permissionFailure ? 503 : 500, origin);
      }
    }

    return jsonResponse({ ok: false, message: 'Rute layanan pendaftaran tidak ditemukan.' }, 404, origin);
  },
};


/**
 * Durable Object provides serialized, one-time state transitions for liveness
 * challenges and proof tokens. KV alone is eventually consistent and cannot
 * safely enforce replay prevention for this security decision.
 */
export class LivenessChallengeStore {
  constructor(private readonly state: LivenessDurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const action = new URL(request.url).pathname.replace(/^\//, '');
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const now = Date.now();
    let record = await this.state.storage.get<LivenessChallengeRecord>('record');

    const respond = (payload: Record<string, unknown>, status = 200) =>
      new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

    if (action === 'create') {
      if (record) return respond({ ok: false, message: 'Challenge sudah pernah dibuat.' }, 409);
      const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
      const challengeId = typeof body.challengeId === 'string' ? body.challengeId : '';
      const uid = typeof body.uid === 'string' ? body.uid : '';
      const consentVersion = typeof body.consentVersion === 'string' ? body.consentVersion : '';
      const createdAt = Number(body.createdAt || now);
      const expiresAt = Number(body.expiresAt || 0);
      if (!sessionId || !challengeId || !uid || uid.length > 128 || !consentVersion
        || expiresAt <= now || expiresAt > now + 11 * 60 * 1000) {
        return respond({ ok: false, message: 'Data challenge liveness tidak valid.' }, 400);
      }
      record = {
        challengeId, uid, sessionId, consentVersion,
        consentAcceptedAt: Number(body.consentAcceptedAt || now),
        createdAt, expiresAt, status: 'created',
      };
      await this.state.storage.put('record', record);
      await this.state.storage.setAlarm?.(expiresAt);
      return respond({ ok: true });
    }

    if (!record || record.challengeId === '' || record.expiresAt < now) {
      if (record) await this.state.storage.delete('record');
      return respond({ ok: false, message: 'Sesi liveness tidak ditemukan atau sudah kedaluwarsa.' }, 404);
    }
    const requesterUid = typeof body.uid === 'string' ? body.uid : '';
    if (!requesterUid || requesterUid !== record.uid) {
      return respond({ ok: false, message: 'Sesi liveness tidak dimiliki akun Firebase ini.' }, 403);
    }

    if (action === 'credentials') {
      if (record.status !== 'created' || record.credentialsIssuedAt) {
        return respond({ ok: false, message: 'Kredensial streaming sesi ini sudah diterbitkan atau sesi tidak aktif.' }, 409);
      }
      record.credentialsIssuedAt = now;
      await this.state.storage.put('record', record);
      return respond({ ok: true });
    }

    if (action === 'verify-start') {
      if (!record.credentialsIssuedAt || (record.status !== 'created' && record.status !== 'verifying')) {
        return respond({ ok: false, message: 'Sesi liveness belum siap diverifikasi atau sudah digunakan.' }, 409);
      }
      record.status = 'verifying';
      await this.state.storage.put('record', record);
      return respond({ ok: true, record });
    }

    if (action === 'verify-complete') {
      if (record.status !== 'verifying') return respond({ ok: false, message: 'Status challenge tidak mengizinkan penyelesaian.' }, 409);
      const passed = body.passed === true;
      record.status = passed ? 'passed' : 'failed';
      if (passed) {
        record.proofToken = typeof body.proofToken === 'string' ? body.proofToken : '';
        record.proofExpiresAt = Number(body.proofExpiresAt || 0);
        if (!record.proofToken || record.proofExpiresAt <= now || record.proofExpiresAt > now + 11 * 60 * 1000) {
          return respond({ ok: false, message: 'Token bukti liveness tidak valid.' }, 400);
        }
      }
      if (typeof body.confidence === 'number' && Number.isFinite(body.confidence)) record.confidence = body.confidence;
      await this.state.storage.put('record', record);
      return respond({ ok: true });
    }

    if (action === 'consume-proof') {
      if (record.status !== 'passed' || record.consumedAt || record.proofExpiresAt === undefined
        || record.proofExpiresAt < now || body.proofToken !== record.proofToken) {
        return respond({ ok: false, message: 'Bukti liveness tidak valid, kedaluwarsa, atau telah digunakan.' }, 409);
      }
      record.consumedAt = now;
      await this.state.storage.delete('record');
      await this.state.storage.deleteAlarm?.();
      return respond({ ok: true, record });
    }

    return respond({ ok: false, message: 'Aksi challenge tidak dikenal.' }, 404);
  }

  async alarm(): Promise<void> {
    await this.state.storage.delete('record');
  }
}

