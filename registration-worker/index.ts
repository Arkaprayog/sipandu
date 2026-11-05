interface KVBinding {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

interface Env {
  TEAM_REGISTRATION_CODE?: string;
  FIREBASE_WEB_API_KEY?: string;
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_SERVICE_ACCOUNT_JSON?: string;
  PENDING_REGISTRATIONS?: KVBinding;
}

interface FirebaseUserLookup {
  localId: string;
  email?: string;
  emailVerified?: boolean;
  customAttributes?: string;
}

const ALLOWED_ORIGINS = new Set([
  'https://sipandu.aryprayoga139.workers.dev',
  'https://sipandu-registration.aryprayoga139.workers.dev',
  'https://localhost',
  'http://localhost',
  'http://localhost:3000',
  'capacitor://localhost',
]);

let cachedGoogleAccessToken = '';
let cachedGoogleAccessTokenExpiresAt = 0;

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

function safeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) diff |= (a[i] || 0) ^ (b[i] || 0);
  return diff === 0;
}

function missingConfiguration(env: Env): string[] {
  const missing: string[] = [];
  if (!env.TEAM_REGISTRATION_CODE) missing.push('TEAM_REGISTRATION_CODE');
  if (!env.FIREBASE_WEB_API_KEY) missing.push('FIREBASE_WEB_API_KEY');
  if (!env.FIREBASE_PROJECT_ID) missing.push('FIREBASE_PROJECT_ID');
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) missing.push('FIREBASE_SERVICE_ACCOUNT_JSON');
  if (!env.PENDING_REGISTRATIONS) missing.push('PENDING_REGISTRATIONS KV');
  return missing;
}

async function parseJson(request: Request): Promise<Record<string, unknown> | null> {
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > 12000) return null;
  try {
    const value = await request.json() as unknown;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

async function allowAttempt(env: Env, request: Request): Promise<boolean> {
  if (!env.PENDING_REGISTRATIONS) return false;
  const address = request.headers.get('CF-Connecting-IP') || 'unknown';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(address));
  const key = Array.from(new Uint8Array(digest).slice(0, 12), (value) => value.toString(16).padStart(2, '0')).join('');
  const storageKey = `rate:${key}`;
  const existing = Number(await env.PENDING_REGISTRATIONS.get(storageKey) || 0);
  if (existing >= 12) return false;
  await env.PENDING_REGISTRATIONS.put(storageKey, String(existing + 1), { expirationTtl: 60 });
  return true;
}

async function validateCode(env: Env, code: string): Promise<boolean> {
  if (!env.TEAM_REGISTRATION_CODE || code.length < 20 || code.length > 160) return false;
  return safeEqual(code.trim(), env.TEAM_REGISTRATION_CODE.trim());
}

async function lookupFirebaseUser(env: Env, idToken: string): Promise<FirebaseUserLookup> {
  if (!env.FIREBASE_WEB_API_KEY) throw new Error('Firebase Authentication API belum dikonfigurasi.');
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`, {
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
  return btoa(binary).replace(/=/g, '').replace(/\\+/g, '-').replace(/\\//g, '_');
}

function encodeTextBase64Url(value: string): string {
  return encodeBase64Url(new TextEncoder().encode(value));
}

async function getGoogleAccessToken(env: Env): Promise<string> {
  if (cachedGoogleAccessToken && Date.now() < cachedGoogleAccessTokenExpiresAt - 60000) {
    return cachedGoogleAccessToken;
  }
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
    scope: 'https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const signingInput = `${header}.${claims}`;
  const privateKeyBase64 = serviceAccount.private_key
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\\s/g, '');
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
  cachedGoogleAccessToken = tokenBody.access_token;
  cachedGoogleAccessTokenExpiresAt = Date.now() + Number(tokenBody.expires_in || 3600) * 1000;
  return cachedGoogleAccessToken;
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
    const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
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
      const missing = missingConfiguration(env);
      return jsonResponse({ ok: true, ready: missing.length === 0, missing }, 200, origin);
    }

    if (path === '/validate-code' && request.method === 'POST') {
      if (!(await allowAttempt(env, request))) {
        return jsonResponse({ ok: false, message: 'Terlalu banyak percobaan. Coba kembali setelah satu menit.' }, 429, origin);
      }
      const body = await parseJson(request);
      if (!body || typeof body.code !== 'string' || !(await validateCode(env, body.code))) {
        return jsonResponse({ ok: false, message: 'Kode pendaftaran tim tidak benar.' }, 403, origin);
      }
      const missing = missingConfiguration(env);
      if (missing.length) {
        return jsonResponse({ ok: false, message: 'Layanan pendaftaran belum siap digunakan administrator.' }, 503, origin);
      }
      return jsonResponse({ ok: true }, 200, origin);
    }

    if (path === '/register' && request.method === 'POST') {
      if (!(await allowAttempt(env, request))) {
        return jsonResponse({ ok: false, message: 'Terlalu banyak percobaan. Coba kembali setelah satu menit.' }, 429, origin);
      }
      if (missingConfiguration(env).length) {
        return jsonResponse({ ok: false, message: 'Layanan pendaftaran belum siap digunakan administrator.' }, 503, origin);
      }
      const body = await parseJson(request);
      if (!body || typeof body.code !== 'string' || !(await validateCode(env, body.code))) {
        return jsonResponse({ ok: false, message: 'Kode pendaftaran tim tidak benar.' }, 403, origin);
      }
      const authorization = request.headers.get('Authorization') || '';
      const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
      if (!idToken) return jsonResponse({ ok: false, message: 'Sesi Firebase tidak ditemukan.' }, 401, origin);
      try {
        const firebaseUser = await lookupFirebaseUser(env, idToken);
        if (!firebaseUser.email || !firebaseUser.localId) {
          return jsonResponse({ ok: false, message: 'Profil akun Firebase belum lengkap.' }, 400, origin);
        }
        await env.PENDING_REGISTRATIONS!.put(`pending:${firebaseUser.localId}`, JSON.stringify({
          uid: firebaseUser.localId,
          email: firebaseUser.email.toLowerCase(),
          createdAt: Date.now(),
        }), { expirationTtl: 7 * 24 * 60 * 60 });
        return jsonResponse({ ok: true, message: 'Pendaftaran tim tersimpan. Verifikasi email untuk mengaktifkan akun.' }, 200, origin);
      } catch (error) {
        return jsonResponse({ ok: false, message: error instanceof Error ? error.message : 'Sesi akun tidak dapat diverifikasi.' }, 401, origin);
      }
    }

    if (path === '/activate' && request.method === 'POST') {
      if (missingConfiguration(env).length) {
        return jsonResponse({ ok: false, message: 'Layanan aktivasi belum siap dikonfigurasi administrator.' }, 503, origin);
      }
      const authorization = request.headers.get('Authorization') || '';
      const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
      if (!idToken) return jsonResponse({ ok: false, message: 'Sesi Firebase tidak ditemukan.' }, 401, origin);
      try {
        const firebaseUser = await lookupFirebaseUser(env, idToken);
        if (!firebaseUser.emailVerified) {
          return jsonResponse({ ok: false, message: 'Email belum diverifikasi. Buka tautan verifikasi terlebih dahulu.' }, 403, origin);
        }
        const key = `pending:${firebaseUser.localId}`;
        const pendingRaw = await env.PENDING_REGISTRATIONS!.get(key);
        if (!pendingRaw) {
          return jsonResponse({ ok: false, message: 'Undangan pendaftaran tim tidak ditemukan atau sudah kedaluwarsa. Minta kode pendaftaran baru dari administrator.' }, 403, origin);
        }
        const pending = JSON.parse(pendingRaw) as { uid?: string; email?: string };
        if (pending.uid !== firebaseUser.localId || pending.email !== String(firebaseUser.email || '').toLowerCase()) {
          return jsonResponse({ ok: false, message: 'Undangan tidak cocok dengan akun Firebase yang masuk.' }, 403, origin);
        }
        await assignPendampingRole(env, firebaseUser);
        await env.PENDING_REGISTRATIONS!.delete(key);
        return jsonResponse({ ok: true, message: 'Akun SIPANDU telah diaktifkan sebagai pendamping.' }, 200, origin);
      } catch (error) {
        return jsonResponse({ ok: false, message: error instanceof Error ? error.message : 'Aktivasi akun belum berhasil.' }, 500, origin);
      }
    }

    return jsonResponse({ ok: false, message: 'Rute layanan pendaftaran tidak ditemukan.' }, 404, origin);
  },
};
