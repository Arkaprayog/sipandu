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
  PENDING_REGISTRATIONS?: KVBinding;
}

interface FirebaseUserLookup {
  localId: string;
  email?: string;
  emailVerified?: boolean;
  disabled?: boolean;
  customAttributes?: string;
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
\n
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
\nconst MAX_PUBLIC_STAGE_ONE_BODY_BYTES = 980_000;

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

async function assignPendampingRole(env: Env, user: FirebaseUserLookup): Promise<void> {
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
  if (currentRole === 'owner' || currentRole === 'supervisor') {
    throw new Error('Peran administrator yang sudah ada tidak dapat diubah melalui pendaftaran anggota.');
  }
  if (currentRole !== undefined && currentRole !== 'pendamping') {
    throw new Error('Akun memiliki peran yang tidak dapat ditimpa melalui pendaftaran mandiri.');
  }
  const accessToken = await getGoogleAccessToken(env);
  const customAttributes = JSON.stringify({ ...existingClaims, role: 'pendamping' });
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
    throw new Error(body.error?.message || 'Firebase gagal menerapkan peran pendamping pada akun.');
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

    if (path === '/health' && request.method === 'GET') {
      const missing = missingActivationConfiguration(env);
      return jsonResponse({ ok: true, ready: missing.length === 0, missing }, 200, origin);
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
          status: String(record.status || 'pending_owner'),
          message: record.status === 'rejected'
            ? 'Permohonan pendaftaran ditolak. Silakan hubungi administrator SIPANDU.'
            : record.status === 'pending_owner'
              ? 'Permohonan masih menunggu persetujuan Owner.'
              : record.status === 'approved'
                ? 'Permohonan disetujui. Verifikasi email dapat dilanjutkan.'
                : record.status === 'active'
                  ? 'Akun SIPANDU sudah aktif.'
                  : 'Status pendaftaran berhasil diperiksa.',
        }, 200, origin);
      } catch {
        return jsonResponse({ ok: false, message: 'Sesi Firebase tidak valid.' }, 401, origin);
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
\n    if (path === '/public-stage-one-intake' && request.method === 'POST') {
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
          return jsonResponse({ ok: false, message: 'Akun harus memiliki email valid yang belum diverifikasi.' }, 400, origin);
        }
        const key = `pending:${firebaseUser.localId}`;
        const existing = await env.PENDING_REGISTRATIONS!.get(key);
        if (existing) {
          let prior: Record<string, unknown> = {};
          try { prior = JSON.parse(existing) as Record<string, unknown>; } catch { /* replace corrupt pending state safely */ }
          if (prior.status === 'approved' || prior.status === 'pending_email' || prior.status === 'active') {
            return jsonResponse({ ok: true, status: prior.status, message: 'Permohonan pendaftaran sudah tercatat.' }, 200, origin);
          }
        }
        await env.PENDING_REGISTRATIONS!.put(key, JSON.stringify({
          uid: firebaseUser.localId,
          email: firebaseUser.email.toLowerCase(),
          createdAt: Date.now(),
          status: 'pending_owner',
        }), { expirationTtl: 7 * 24 * 60 * 60 });
        const ownerNotificationSent = env.OWNER_NOTIFICATION_EMAIL
          ? await sendSIPANDUEmail(
              env,
              env.OWNER_NOTIFICATION_EMAIL,
              'Permohonan tim baru menunggu persetujuan · SIPANDU',
              'Permohonan pendaftaran tim baru',
              'Permohonan baru dari ' + firebaseUser.email + ' menunggu pemeriksaan di panel Pendaftaran Tim SIPANDU.',
            ).catch(() => false)
          : false;
        return jsonResponse({
          ok: true,
          status: 'pending_owner',
          ownerNotificationSent,
          message: 'Permohonan tersimpan dan menunggu persetujuan Owner atau administrator SIPANDU.',
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
      if (!targetUid || targetUid.length > 128 || /[\\/\\s]/.test(targetUid)) {
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
            ? 'Permohonan Anda telah disetujui. Silakan masuk ke SIPANDU menggunakan email dan kata sandi saat mendaftar. Sistem akan mengirim tautan verifikasi email setelah persetujuan ini.'
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
      // Use the existing KV limiter when provisioned. Activation itself does not
      // depend on invitation records or KV, so a verified member is never blocked
      // merely because a pending-registration namespace is absent.
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
        if (firebaseUser.customAttributes) {
          let claims: Record<string, unknown> = {};
          try { claims = JSON.parse(firebaseUser.customAttributes) as Record<string, unknown>; } catch {
            return jsonResponse({ ok: false, message: 'Klaim akun tidak dapat dibaca dengan aman.' }, 403, origin);
          }
          // Existing Owner, Supervisor, and already-activated staff keep their current access.
          if (claims.role === 'owner' || claims.role === 'supervisor' || claims.role === 'pendamping') {
            return jsonResponse({ ok: true, status: 'active', message: 'Akun SIPANDU yang sudah aktif dipertahankan.' }, 200, origin);
          }
        }
        if (!env.PENDING_REGISTRATIONS) {
          return jsonResponse({ ok: false, message: 'Pemeriksaan persetujuan Owner belum tersedia.' }, 503, origin);
        }
        const pendingRaw = await env.PENDING_REGISTRATIONS.get(`pending:${firebaseUser.localId}`);
        if (!pendingRaw) {
          return jsonResponse({ ok: false, message: 'Permohonan pendaftaran tidak ditemukan. Akun belum dapat diaktifkan.' }, 403, origin);
        }
        let pending: Record<string, unknown>;
        try { pending = JSON.parse(pendingRaw) as Record<string, unknown>; } catch {
          return jsonResponse({ ok: false, message: 'Data persetujuan tidak valid. Hubungi administrator.' }, 409, origin);
        }
        if (pending.status !== 'approved' && pending.status !== 'pending_email') {
          const message = pending.status === 'rejected'
            ? 'Permohonan pendaftaran ditolak oleh Owner. Hubungi administrator SIPANDU.'
            : 'Akun belum dapat login. Menunggu persetujuan Owner atau administrator SIPANDU.';
          return jsonResponse({ ok: false, status: pending.status || 'pending_owner', message }, 403, origin);
        }
        await assignPendampingRole(env, firebaseUser);
        await env.PENDING_REGISTRATIONS.put(`pending:${firebaseUser.localId}`, JSON.stringify({
          ...pending,
          status: 'active',
          activatedAt: Date.now(),
        }), { expirationTtl: 365 * 24 * 60 * 60 });
        return jsonResponse({ ok: true, status: 'active', message: 'Persetujuan Owner dan verifikasi email selesai. Akun SIPANDU aktif sebagai anggota.' }, 200, origin);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Aktivasi akun belum berhasil.';
        const permissionFailure = /INSUFFICIENT_PERMISSION|PERMISSION_DENIED|firebaseauth[.]users[.]update/i.test(message);
        return jsonResponse({ ok: false, message }, permissionFailure ? 503 : 500, origin);
      }
    }

    return jsonResponse({ ok: false, message: 'Rute layanan pendaftaran tidak ditemukan.' }, 404, origin);
  },
};
