interface Env {
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_AUTH_API_KEY?: string;
  GOOGLE_DRIVE_FOLDER_ID?: string;
  GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON?: string;
}

interface FirebaseLookupUser {
  localId?: string;
  email?: string;
  emailVerified?: boolean;
  customAttributes?: string;
}

interface ServiceAccount {
  project_id?: string;
  client_email?: string;
  private_key?: string;
}

interface DriveFile {
  id?: string;
  name?: string;
  mimeType?: string;
  size?: string;
  webViewLink?: string;
  trashed?: boolean;
  parents?: string[];
  appProperties?: Record<string, string>;
}

const ALLOWED_ORIGINS = new Set([
  'https://sipanduodhiv.my.id',
  'https://sipandu-sigma.vercel.app',
  'https://sipandu.aryprayoga139.workers.dev',
  'capacitor://localhost',
  'https://localhost',
  'http://localhost',
  'http://localhost:3000',
]);
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const MAX_PDF_BYTES = 24 * 1024 * 1024;
let cachedDriveToken: { token: string; expiresAt: number } | null = null;

function cors(origin: string | null): HeadersInit {
  const headers: Record<string, string> = {
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function json(data: Record<string, unknown>, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors(origin),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function encodeTextBase64Url(value: string): string {
  return encodeBase64Url(new TextEncoder().encode(value));
}

function parseServiceAccount(env: Env): ServiceAccount {
  if (!env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON) throw new Error('Kredensial arsip Google Drive belum dipasang pada Worker.');
  let account: ServiceAccount;
  try {
    account = JSON.parse(env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON) as ServiceAccount;
  } catch {
    throw new Error('Secret GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON bukan JSON yang valid.');
  }
  if (!account.client_email || !account.private_key) {
    throw new Error('Service account Google Drive tidak memiliki client_email atau private_key.');
  }
  if (account.project_id && env.FIREBASE_PROJECT_ID && account.project_id !== env.FIREBASE_PROJECT_ID) {
    // A dedicated Drive service account may live in a separate Google Cloud project.
    // Its project ID is intentionally not required to equal the Firebase project.
  }
  return account;
}

async function getDriveAccessToken(env: Env, force = false): Promise<string> {
  if (!force && cachedDriveToken && Date.now() < cachedDriveToken.expiresAt - 60_000) {
    return cachedDriveToken.token;
  }
  const account = parseServiceAccount(env);
  const now = Math.floor(Date.now() / 1000);
  const header = encodeTextBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = encodeTextBase64Url(JSON.stringify({
    iss: account.client_email,
    scope: DRIVE_SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const signingInput = header + '.' + claims;
  const pem = account.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');
  const keyBytes = Uint8Array.from(atob(pem), (character) => character.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput),
  );
  const assertion = signingInput + '.' + encodeBase64Url(new Uint8Array(signature));
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const payload = await response.json() as { access_token?: string; expires_in?: number };
  if (!response.ok || !payload.access_token) {
    cachedDriveToken = null;
    throw new Error('Google menolak kredensial service account untuk arsip Drive.');
  }
  cachedDriveToken = {
    token: payload.access_token,
    expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000,
  };
  return payload.access_token;
}

async function lookupFirebaseUser(env: Env, idToken: string): Promise<FirebaseLookupUser> {
  if (!env.FIREBASE_PROJECT_ID) throw new Error('FIREBASE_PROJECT_ID belum dikonfigurasi.');
  const apiKey = env.FIREBASE_AUTH_API_KEY;
  if (!apiKey) throw new Error('FIREBASE_AUTH_API_KEY belum dikonfigurasi.');
  const response = await fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(apiKey),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    },
  );
  const result = await response.json() as { users?: FirebaseLookupUser[] };
  const user = result.users?.[0];
  if (!response.ok || !user?.localId) throw new Error('Sesi Firebase tidak valid atau kedaluwarsa.');
  let claims: Record<string, unknown> = {};
  if (user.customAttributes) {
    try {
      const parsed = JSON.parse(user.customAttributes) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid');
      claims = parsed as Record<string, unknown>;
    } catch {
      throw new Error('Klaim peran akun Firebase tidak dapat diverifikasi.');
    }
  }
  if (!['owner', 'supervisor', 'pendamping'].includes(String(claims.role || ''))) {
    throw new Error('Akun tidak memiliki peran SIPANDU yang diizinkan untuk mengarsipkan asesmen.');
  }
  return user;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function driveRequest(
  env: Env,
  path: string,
  init: RequestInit = {},
  retry401 = true,
): Promise<Response> {
  let token = await getDriveAccessToken(env);
  const send = (accessToken: string) => fetch('https://www.googleapis.com/drive/v3' + path, {
    ...init,
    headers: { Authorization: 'Bearer ' + accessToken, ...(init.headers || {}) },
  });
  let response = await send(token);
  if (response.status === 401 && retry401) {
    token = await getDriveAccessToken(env, true);
    response = await send(token);
  }
  return response;
}

async function verifyDestinationFolder(env: Env): Promise<void> {
  const folderId = env.GOOGLE_DRIVE_FOLDER_ID?.trim();
  if (!folderId) throw new Error('GOOGLE_DRIVE_FOLDER_ID belum dikonfigurasi.');
  const response = await driveRequest(
    env,
    '/files/' + encodeURIComponent(folderId) + '?fields=id,mimeType,trashed',
  );
  if (!response.ok) {
    throw new Error('Folder arsip tujuan tidak dapat diakses oleh service account (HTTP ' + response.status + ').');
  }
  const folder = await response.json() as DriveFile;
  if (folder.id !== folderId || folder.mimeType !== 'application/vnd.google-apps.folder' || folder.trashed) {
    throw new Error('ID tujuan bukan folder Google Drive aktif yang valid.');
  }
}

function multipartBody(metadata: Record<string, unknown>, pdf: ArrayBuffer, boundary: string): Blob {
  return new Blob([
    '--' + boundary + '\r\n',
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    JSON.stringify(metadata) + '\r\n',
    '--' + boundary + '\r\n',
    'Content-Type: application/pdf\r\n',
    'Content-Transfer-Encoding: binary\r\n\r\n',
    pdf,
    '\r\n--' + boundary + '--',
  ]);
}

async function findExistingArchive(env: Env, archiveKey: string): Promise<DriveFile | null> {
  const folderId = env.GOOGLE_DRIVE_FOLDER_ID!;
  const query = [
    "mimeType='application/pdf'",
    "trashed=false",
    "'" + escapeDriveQuery(folderId) + "' in parents",
    "appProperties has { key='sipanduArchiveKey' and value='" + escapeDriveQuery(archiveKey) + "' }",
  ].join(' and ');
  const response = await driveRequest(
    env,
    '/files?q=' + encodeURIComponent(query) + '&pageSize=2&fields=files(id,name,mimeType,size,webViewLink,parents,appProperties,trashed)',
  );
  if (!response.ok) throw new Error('Google Drive gagal memeriksa arsip sebelumnya.');
  const payload = await response.json() as { files?: DriveFile[] };
  if ((payload.files || []).length > 1) {
    throw new Error('Ditemukan lebih dari satu arsip dengan kunci yang sama. Perlu pemeriksaan administrator.');
  }
  return payload.files?.[0] || null;
}

async function uploadPdf(
  env: Env,
  pdf: Blob,
  archiveKey: string,
): Promise<DriveFile> {
  const folderId = env.GOOGLE_DRIVE_FOLDER_ID!;
  const existing = await findExistingArchive(env, archiveKey);
  const fileName = 'Form-Asesmen-Terintegrasi-' + archiveKey.slice(0, 20) + '.pdf';
  const metadata = {
    name: fileName,
    mimeType: 'application/pdf',
    parents: existing?.id ? undefined : [folderId],
    appProperties: {
      sipanduManaged: 'true',
      sipanduArchiveKey: archiveKey,
    },
  };
  const boundary = 'sipandu_' + crypto.randomUUID().replace(/-/g, '');
  const body = multipartBody(metadata, await pdf.arrayBuffer(), boundary);
  const path = existing?.id
    ? '/files/' + encodeURIComponent(existing.id) + '?uploadType=multipart&fields=id,name,mimeType,size,webViewLink,parents,appProperties'
    : '/files?uploadType=multipart&fields=id,name,mimeType,size,webViewLink,parents,appProperties';
  const response = await driveRequest(env, path, {
    method: existing?.id ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
    body,
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(detail.error?.message || 'Google Drive menolak upload PDF (HTTP ' + response.status + ').');
  }
  const uploaded = await response.json() as DriveFile;
  if (!uploaded.id) throw new Error('Google Drive tidak mengembalikan ID file setelah upload.');
  return uploaded;
}

async function verifyUploadedFile(env: Env, fileId: string, expectedSize: number, archiveKey: string): Promise<DriveFile> {
  const response = await driveRequest(
    env,
    '/files/' + encodeURIComponent(fileId) + '?fields=id,name,mimeType,size,webViewLink,parents,appProperties,trashed',
  );
  if (!response.ok) throw new Error('File PDF terunggah tetapi verifikasi ulang Google Drive gagal.');
  const file = await response.json() as DriveFile;
  if (
    file.id !== fileId ||
    file.mimeType !== 'application/pdf' ||
    Number(file.size) !== expectedSize ||
    file.trashed === true ||
    !(file.parents || []).includes(env.GOOGLE_DRIVE_FOLDER_ID || '') ||
    file.appProperties?.sipanduArchiveKey !== archiveKey ||
    file.appProperties?.sipanduManaged !== 'true'
  ) {
    throw new Error('File ditemukan di Drive tetapi gagal melewati verifikasi tipe, ukuran, folder, atau identitas arsip.');
  }
  return file;
}

async function archivePdf(env: Env, ppksId: string, pdf: Blob): Promise<DriveFile> {
  if (!ppksId || ppksId.length > 180 || ppksId.includes('/')) throw new Error('ID responden tidak valid.');
  if (pdf.type !== 'application/pdf' || pdf.size < 8 || pdf.size > MAX_PDF_BYTES) {
    throw new Error('PDF harus bertipe application/pdf dan berukuran maksimal 24 MiB.');
  }
  if ((await pdf.slice(0, 5).text()) !== '%PDF-') throw new Error('Isi berkas bukan PDF yang valid.');
  await verifyDestinationFolder(env);
  const archiveKey = await sha256Hex('sipandu-integrated-assessment:' + ppksId);
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const uploaded = await uploadPdf(env, pdf, archiveKey);
      if (!uploaded.id) throw new Error('Upload tidak menghasilkan ID file.');
      return await verifyUploadedFile(env, uploaded.id, pdf.size, archiveKey);
    } catch (error) {
      lastError = error;
      if (attempt === 2) break;
      if (error instanceof Error && !/HTTP (429|500|502|503|504)|temporarily|timeout|network/i.test(error.message)) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Upload arsip Google Drive gagal setelah percobaan ulang.');
}

function missingConfiguration(env: Env): string[] {
  const missing: string[] = [];
  if (!env.FIREBASE_PROJECT_ID) missing.push('FIREBASE_PROJECT_ID');
  if (!env.FIREBASE_AUTH_API_KEY) missing.push('FIREBASE_AUTH_API_KEY');
  if (!env.GOOGLE_DRIVE_FOLDER_ID) missing.push('GOOGLE_DRIVE_FOLDER_ID');
  if (!env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON) missing.push('GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON');
  return missing;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ ok: false, message: 'Origin tidak diizinkan.' }, 403, null);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    const url = new URL(request.url);

    if (url.pathname === '/health' && request.method === 'GET') {
      const missing = missingConfiguration(env);
      if (missing.length) return json({ ok: false, ready: false, missing }, 503, origin);
      try {
        await verifyDestinationFolder(env);
        return json({ ok: true, ready: true, destinationVerified: true }, 200, origin);
      } catch (error) {
        return json({ ok: false, ready: false, destinationVerified: false, message: error instanceof Error ? error.message : 'Folder tujuan belum dapat diverifikasi.' }, 503, origin);
      }
    }

    if (url.pathname !== '/archive' || request.method !== 'POST') {
      return json({ ok: false, message: 'Endpoint tidak ditemukan.' }, 404, origin);
    }
    if (missingConfiguration(env).length) {
      return json({ ok: false, message: 'Layanan arsip belum dikonfigurasi administrator.' }, 503, origin);
    }
    const authorization = request.headers.get('Authorization') || '';
    const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!idToken) return json({ ok: false, message: 'Sesi Firebase tidak ditemukan.' }, 401, origin);

    try {
      await lookupFirebaseUser(env, idToken);
      const form = await request.formData();
      const ppksId = String(form.get('ppksId') || '').trim();
      const file = form.get('file');
      if (!(file instanceof File)) return json({ ok: false, message: 'PDF asesmen tidak ditemukan pada permintaan.' }, 400, origin);
      if (file.size > MAX_PDF_BYTES) return json({ ok: false, message: 'Ukuran PDF melebihi batas 24 MiB.' }, 413, origin);
      const uploaded = await archivePdf(env, ppksId, file);
      return json({
        ok: true,
        verified: true,
        fileId: uploaded.id,
        fileName: uploaded.name,
        mimeType: uploaded.mimeType,
        size: Number(uploaded.size),
        webViewLink: uploaded.webViewLink || ('https://drive.google.com/open?id=' + encodeURIComponent(uploaded.id || '')),
      }, 200, origin);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Arsip PDF belum dapat disimpan.';
      const status = /sesi firebase/i.test(message) ? 401 : /peran sipandu|peran akun/i.test(message) ? 403 : 502;
      return json({ ok: false, verified: false, message }, status, origin);
    }
  },
};
