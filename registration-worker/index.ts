interface KVBinding {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

interface Env {
  FIREBASE_AUTH_API_KEY?: string;
  /** Legacy fallback for environments not yet deployed from the hardened config. */
  FIREBASE_WEB_API_KEY?: string;
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_DATABASE_ID?: string;
  FIREBASE_SERVICE_ACCOUNT_JSON?: string;
  TURNSTILE_SECRET_KEY?: string;
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
          return jsonResponse({ ok: false, message: 'Akun harus memiliki email valid yang belum diverifikasi.' }, 400, origin);
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

        const email = firebaseUser.email.trim().toLowerCase();
        const now = Date.now();
        await env.PENDING_REGISTRATIONS!.put(`pending:${firebaseUser.localId}`, JSON.stringify({
          uid: firebaseUser.localId,
          email,
          createdAt: now,
          restoredAt: now,
        }), { expirationTtl: 7 * 24 * 60 * 60 });
        return jsonResponse({ ok: true, message: 'Undangan tim berhasil dipulihkan untuk akun dan email yang sama. Lanjutkan aktivasi.' }, 200, origin);
      } catch (error) {
        return jsonResponse({ ok: false, message: error instanceof Error ? error.message : 'Undangan tim belum dapat dipulihkan.' }, 401, origin);
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
        await assignPendampingRole(env, firebaseUser);
        return jsonResponse({ ok: true, message: 'Email terverifikasi. Akun SIPANDU aktif sebagai anggota.' }, 200, origin);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Aktivasi akun belum berhasil.';
        const permissionFailure = /INSUFFICIENT_PERMISSION|PERMISSION_DENIED|firebaseauth[.]users[.]update/i.test(message);
        return jsonResponse({ ok: false, message }, permissionFailure ? 503 : 500, origin);
      }
    }

    return jsonResponse({ ok: false, message: 'Rute layanan pendaftaran tidak ditemukan.' }, 404, origin);
  },
};
