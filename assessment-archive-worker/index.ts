interface Env {
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_AUTH_API_KEY?: string;
  GOOGLE_WORKSPACE_EMAIL?: string;
}

interface FirebaseLookupUser {
  localId?: string;
  email?: string;
  customAttributes?: string;
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
const MAX_PDF_BYTES = 24 * 1024 * 1024;

function cors(origin: string | null): HeadersInit {
  const headers: Record<string, string> = {
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Google-Access-Token',
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

async function lookupFirebaseUser(env: Env, idToken: string): Promise<FirebaseLookupUser> {
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_AUTH_API_KEY) {
    throw new Error('Konfigurasi verifikasi Firebase belum lengkap.');
  }
  const response = await fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(env.FIREBASE_AUTH_API_KEY),
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

/** Google userinfo binds the short-lived Drive token to the expected Workspace identity. */
async function verifyGoogleIdentity(accessToken: string, expectedEmail: string): Promise<void> {
  if (!accessToken || accessToken.length > 8192) throw new Error('Token OAuth Google tidak tersedia atau tidak valid.');
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: 'Bearer ' + accessToken },
  });
  if (response.status === 401) throw new Error('Token OAuth Google kedaluwarsa. Pulihkan koneksi Google Workspace lalu ulangi arsip.');
  if (!response.ok) throw new Error('Identitas akun Google tidak dapat diverifikasi.');
  const profile = await response.json() as { email?: string; email_verified?: boolean };
  if (
    String(profile.email || '').trim().toLowerCase() !== expectedEmail.trim().toLowerCase() ||
    profile.email_verified === false
  ) {
    throw new Error('Token Google bukan berasal dari akun Workspace SIPANDU yang ditetapkan.');
  }
}

async function driveRequest(accessToken: string, path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch('https://www.googleapis.com/drive/v3' + path, {
    ...init,
    headers: { Authorization: 'Bearer ' + accessToken, ...(init.headers || {}) },
  });
  if (response.status === 401) {
    throw new Error('Token OAuth Google kedaluwarsa. Pulihkan koneksi Google Workspace lalu ulangi arsip.');
  }
  return response;
}

async function getOrCreateFolder(accessToken: string, name: string, parentId?: string): Promise<string> {
  const parentClause = parentId ? " and '" + escapeDriveQuery(parentId) + "' in parents" : " and 'root' in parents";
  const query = "mimeType='application/vnd.google-apps.folder' and name='" +
    escapeDriveQuery(name) + "' and trashed=false" + parentClause;
  const found = await driveRequest(
    accessToken,
    '/files?q=' + encodeURIComponent(query) + '&pageSize=10&fields=files(id,name,mimeType,parents)',
  );
  if (!found.ok) throw new Error('Google Drive gagal memeriksa folder arsip SIPANDU (HTTP ' + found.status + ').');
  const payload = await found.json() as { files?: DriveFile[] };
  const matches = payload.files || [];
  if (matches.length > 1) {
    throw new Error('Ditemukan beberapa folder dengan nama arsip yang sama. Perlu pemeriksaan administrator.');
  }
  if (matches[0]?.id) return matches[0].id;

  const created = await driveRequest(accessToken, '/files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
  if (!created.ok) {
    const detail = await created.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(detail.error?.message || 'Folder arsip SIPANDU gagal dibuat di Google Drive.');
  }
  const folder = await created.json() as DriveFile;
  if (!folder.id) throw new Error('Google Drive membuat folder tanpa mengembalikan ID.');
  return folder.id;
}

async function ensureArchiveFolder(accessToken: string, archiveKey: string): Promise<string> {
  const root = await getOrCreateFolder(accessToken, 'SIPANDU');
  const assessments = await getOrCreateFolder(accessToken, 'From Asesmen Terintegrasi', root);
  return getOrCreateFolder(accessToken, archiveKey.slice(0, 20), assessments);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
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

async function findExistingArchive(accessToken: string, archiveKey: string, folderId: string): Promise<DriveFile | null> {
  const query = [
    "mimeType='application/pdf'",
    'trashed=false',
    "'" + escapeDriveQuery(folderId) + "' in parents",
    "appProperties has { key='sipanduArchiveKey' and value='" + escapeDriveQuery(archiveKey) + "' }",
  ].join(' and ');
  const response = await driveRequest(
    accessToken,
    '/files?q=' + encodeURIComponent(query) + '&pageSize=2&fields=files(id,name,mimeType,size,parents,appProperties,trashed)',
  );
  if (!response.ok) throw new Error('Google Drive gagal memeriksa arsip sebelumnya (HTTP ' + response.status + ').');
  const payload = await response.json() as { files?: DriveFile[] };
  if ((payload.files || []).length > 1) {
    throw new Error('Ditemukan lebih dari satu arsip dengan kunci yang sama. Perlu pemeriksaan administrator.');
  }
  return payload.files?.[0] || null;
}

async function uploadPdf(
  accessToken: string,
  pdf: Blob,
  archiveKey: string,
  folderId: string,
): Promise<{ file: DriveFile; replacedExisting: boolean }> {
  const existing = await findExistingArchive(accessToken, archiveKey, folderId);
  const fileName = 'Form-Asesmen-Terintegrasi-' + archiveKey.slice(0, 20) + '.pdf';
  const metadata = {
    name: fileName,
    mimeType: 'application/pdf',
    ...(existing?.id ? {} : { parents: [folderId] }),
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
  const response = await driveRequest(accessToken, path, {
    method: existing?.id ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
    body,
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error((detail.error?.message || 'Google Drive menolak upload PDF') + ' (HTTP ' + response.status + ').');
  }
  const uploaded = await response.json() as DriveFile;
  if (!uploaded.id) throw new Error('Google Drive tidak mengembalikan ID file setelah upload.');
  return { file: uploaded, replacedExisting: Boolean(existing?.id) };
}

async function verifyUploadedFile(
  accessToken: string,
  fileId: string,
  expectedSize: number,
  archiveKey: string,
  folderId: string,
): Promise<DriveFile> {
  const response = await driveRequest(
    accessToken,
    '/files/' + encodeURIComponent(fileId) + '?fields=id,name,mimeType,size,webViewLink,parents,appProperties,trashed',
  );
  if (!response.ok) throw new Error('File PDF terunggah tetapi verifikasi ulang Google Drive gagal.');
  const file = await response.json() as DriveFile;
  if (
    file.id !== fileId ||
    file.mimeType !== 'application/pdf' ||
    Number(file.size) !== expectedSize ||
    file.trashed === true ||
    !(file.parents || []).includes(folderId) ||
    file.appProperties?.sipanduArchiveKey !== archiveKey ||
    file.appProperties?.sipanduManaged !== 'true'
  ) {
    throw new Error('File ditemukan di Drive tetapi gagal melewati verifikasi tipe, ukuran, folder, atau identitas arsip.');
  }
  return file;
}

async function archivePdf(
  env: Env,
  accessToken: string,
  ppksId: string,
  pdf: Blob,
): Promise<{ file: DriveFile; replacedExisting: boolean }> {
  if (!ppksId || ppksId.length > 180 || ppksId.includes('/')) throw new Error('ID responden tidak valid.');
  if (pdf.type !== 'application/pdf' || pdf.size < 8 || pdf.size > MAX_PDF_BYTES) {
    throw new Error('PDF harus bertipe application/pdf dan berukuran maksimal 24 MiB.');
  }
  if ((await pdf.slice(0, 5).text()) !== '%PDF-') throw new Error('Isi berkas bukan PDF yang valid.');
  const archiveKey = await sha256Hex('sipandu-integrated-assessment:' + ppksId);
  const folderId = await ensureArchiveFolder(accessToken, archiveKey);
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const upload = await uploadPdf(accessToken, pdf, archiveKey, folderId);
      const verified = await verifyUploadedFile(accessToken, upload.file.id!, pdf.size, archiveKey, folderId);
      return { file: verified, replacedExisting: upload.replacedExisting };
    } catch (error) {
      lastError = error;
      if (attempt === 2) break;
      const transient = error instanceof TypeError
        || (error instanceof Error && /HTTP (429|500|502|503|504)|temporarily|timeout|network|fetch failed|internal error/i.test(error.message));
      if (!transient) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Upload arsip Google Drive gagal setelah percobaan ulang.');
}


const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
const DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'image/bmp', 'image/tiff', 'image/heic', 'image/heif',
]);
const DOCUMENT_CATEGORIES: Record<string, string> = {
  'surat-tugas': 'Surat Tugas',
  'surat-lainnya': 'Dokumen Lainnya',
};

function firebaseRole(user: FirebaseLookupUser): string {
  try {
    const attributes = JSON.parse(user.customAttributes || '{}') as Record<string, unknown>;
    return String(attributes.role || '');
  } catch {
    return '';
  }
}

function safeDocumentName(value: string): string {
  const cleaned = value.normalize('NFKC')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/[\u0000-\u001f]/g, '')
    .trim().slice(0, 180);
  return cleaned || 'dokumen';
}

async function ensureStaffDocumentFolder(accessToken: string, category: string): Promise<string> {
  const root = await getOrCreateFolder(accessToken, 'SIPANDU');
  const documents = await getOrCreateFolder(accessToken, 'Dokumen', root);
  return getOrCreateFolder(accessToken, DOCUMENT_CATEGORIES[category], documents);
}

async function verifyManagedStaffDocument(
  accessToken: string,
  fileId: string,
  expected?: { ownerUid: string; category: string; size: number; mimeType: string; folderId: string },
): Promise<DriveFile> {
  const response = await driveRequest(
    accessToken,
    '/files/' + encodeURIComponent(fileId) + '?fields=id,name,mimeType,size,webViewLink,parents,appProperties,trashed',
  );
  if (response.status === 404) throw new Error('Dokumen tidak ditemukan di arsip Google Drive SIPANDU.');
  if (!response.ok) throw new Error('Metadata dokumen tidak dapat diverifikasi di Google Drive (HTTP ' + response.status + ').');
  const file = await response.json() as DriveFile;
  const props = file.appProperties || {};
  const valid = file.id === fileId
    && file.trashed !== true
    && DOCUMENT_MIME_TYPES.has(String(file.mimeType || ''))
    && Number(file.size) > 0
    && Number(file.size) <= MAX_DOCUMENT_BYTES
    && props.sipanduManaged === 'true'
    && props.sipanduDocument === 'true'
    && Object.prototype.hasOwnProperty.call(DOCUMENT_CATEGORIES, String(props.sipanduCategory || ''));
  if (!valid) throw new Error('File tidak terdaftar sebagai dokumen privat yang dikelola SIPANDU.');
  if (expected && (
    props.sipanduOwnerUid !== expected.ownerUid
    || props.sipanduCategory !== expected.category
    || Number(file.size) !== expected.size
    || file.mimeType !== expected.mimeType
    || !(file.parents || []).includes(expected.folderId)
  )) {
    throw new Error('Dokumen Drive tidak cocok dengan metadata upload SIPANDU.');
  }
  return file;
}

async function uploadManagedStaffDocument(
  accessToken: string,
  file: File,
  ownerUid: string,
  category: string,
): Promise<DriveFile> {
  if (!DOCUMENT_CATEGORIES[category]) throw new Error('Kategori dokumen tidak valid.');
  if (!(file instanceof File) || file.size <= 0 || file.size > MAX_DOCUMENT_BYTES) {
    throw new Error('Dokumen harus berukuran lebih dari 0 dan maksimal 25 MiB.');
  }
  if (!DOCUMENT_MIME_TYPES.has(file.type)) throw new Error('Format dokumen tidak didukung.');
  const folderId = await ensureStaffDocumentFolder(accessToken, category);
  const name = safeDocumentName(file.name);
  const metadata = {
    name,
    mimeType: file.type,
    parents: [folderId],
    appProperties: {
      sipanduManaged: 'true',
      sipanduDocument: 'true',
      sipanduOwnerUid: ownerUid,
      sipanduCategory: category,
    },
  };
  const boundary = 'sipandu_doc_' + crypto.randomUUID().replace(/-/g, '');
  const body = new Blob([
    '--' + boundary + '\r\n',
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    JSON.stringify(metadata) + '\r\n',
    '--' + boundary + '\r\n',
    'Content-Type: ' + file.type + '\r\n',
    'Content-Transfer-Encoding: binary\r\n\r\n',
    await file.arrayBuffer(),
    '\r\n--' + boundary + '--',
  ]);
  const response = await driveRequest(accessToken, '/files?uploadType=multipart&fields=id,name,mimeType,size,webViewLink,parents,appProperties', {
    method: 'POST',
    headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
    body,
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error((detail.error?.message || 'Google Drive menolak upload dokumen') + ' (HTTP ' + response.status + ').');
  }
  const uploaded = await response.json() as DriveFile;
  if (!uploaded.id) throw new Error('Google Drive tidak mengembalikan ID dokumen.');
  try {
    return await verifyManagedStaffDocument(accessToken, uploaded.id, {
      ownerUid,
      category,
      size: file.size,
      mimeType: file.type,
      folderId,
    });
  } catch (error) {
    try { await driveRequest(accessToken, '/files/' + encodeURIComponent(uploaded.id), { method: 'DELETE' }); } catch { /* preserve verification failure */ }
    throw error;
  }
}

async function handleStaffDocumentRoute(
  request: Request,
  env: Env,
  url: URL,
  origin: string | null,
): Promise<Response> {
  try {
    const authorization = request.headers.get('Authorization') || '';
    const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    const googleAccessToken = (request.headers.get('X-Google-Access-Token') || '').trim();
    if (!idToken) return json({ ok: false, message: 'Sesi Firebase tidak ditemukan.' }, 401, origin);
    if (!googleAccessToken) return json({ ok: false, message: 'Sesi Google Workspace tidak ditemukan.' }, 401, origin);
    const user = await lookupFirebaseUser(env, idToken);
    const role = firebaseRole(user);
    await verifyGoogleIdentity(googleAccessToken, env.GOOGLE_WORKSPACE_EMAIL!);

    if (url.pathname === '/documents' && request.method === 'POST') {
      const contentLength = Number(request.headers.get('Content-Length') || 0);
      if (contentLength > MAX_DOCUMENT_BYTES + 128 * 1024) {
        return json({ ok: false, message: 'Ukuran permintaan melebihi batas 25 MiB.' }, 413, origin);
      }
      const form = await request.formData();
      const category = String(form.get('category') || '');
      const file = form.get('file');
      if (!(file instanceof File)) return json({ ok: false, message: 'Dokumen tidak ditemukan pada permintaan.' }, 400, origin);
      const uploaded = await uploadManagedStaffDocument(googleAccessToken, file, user.localId!, category);
      return json({
        ok: true,
        verified: true,
        fileId: uploaded.id,
        fileName: uploaded.name,
        mimeType: uploaded.mimeType,
        size: Number(uploaded.size),
      }, 200, origin);
    }

    const match = url.pathname.match(/^\/documents\/([^/]+)$/);
    if (!match || !['GET', 'DELETE'].includes(request.method)) {
      return json({ ok: false, message: 'Endpoint dokumen tidak ditemukan.' }, 404, origin);
    }
    const fileId = decodeURIComponent(match[1]);
    if (!/^[A-Za-z0-9_-]{1,256}$/.test(fileId)) {
      return json({ ok: false, message: 'ID dokumen tidak valid.' }, 400, origin);
    }
    let metadata: DriveFile;
    try {
      metadata = await verifyManagedStaffDocument(googleAccessToken, fileId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Dokumen tidak dapat diverifikasi.';
      const status = /tidak ditemukan/i.test(message) ? 404 : 403;
      return json({ ok: false, message }, status, origin);
    }
    const ownerUid = String(metadata.appProperties?.sipanduOwnerUid || '');
    if (ownerUid !== user.localId && role !== 'owner' && role !== 'supervisor') {
      return json({ ok: false, message: 'Anda tidak memiliki izin untuk mengakses dokumen petugas lain.' }, 403, origin);
    }

    if (request.method === 'DELETE') {
      const removed = await driveRequest(googleAccessToken, '/files/' + encodeURIComponent(fileId), { method: 'DELETE' });
      if (!removed.ok && removed.status !== 404) {
        return json({ ok: false, message: 'Dokumen gagal dihapus dari Google Drive (HTTP ' + removed.status + ').' }, 502, origin);
      }
      return json({ ok: true, deleted: true }, 200, origin);
    }

    const download = await driveRequest(googleAccessToken, '/files/' + encodeURIComponent(fileId) + '?alt=media');
    if (!download.ok || !download.body) {
      return json({ ok: false, message: 'Isi dokumen tidak dapat diunduh dari Google Drive (HTTP ' + download.status + ').' }, 502, origin);
    }
    const filename = encodeURIComponent(safeDocumentName(String(metadata.name || 'dokumen')));
    return new Response(download.body, {
      status: 200,
      headers: {
        ...cors(origin),
        'Content-Type': String(metadata.mimeType),
        'Content-Length': String(metadata.size),
        'Content-Disposition': "attachment; filename*=UTF-8''" + filename,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Operasi arsip dokumen gagal.';
    const status = /sesi firebase|token oauth google|sesi google workspace/i.test(message) ? 401
      : /peran sipandu|peran akun|tidak memiliki izin/i.test(message) ? 403
      : /format dokumen|kategori dokumen|ukuran permintaan|dokumen harus|id dokumen/i.test(message) ? 400
      : 502;
    return json({ ok: false, message }, status, origin);
  }
}

function missingConfiguration(env: Env): string[] {
  const missing: string[] = [];
  if (!env.FIREBASE_PROJECT_ID) missing.push('FIREBASE_PROJECT_ID');
  if (!env.FIREBASE_AUTH_API_KEY) missing.push('FIREBASE_AUTH_API_KEY');
  if (!env.GOOGLE_WORKSPACE_EMAIL) missing.push('GOOGLE_WORKSPACE_EMAIL');
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
      return missing.length
        ? json({ ok: false, ready: false, missing }, 503, origin)
        : json({ ok: true, ready: true, destinationVerified: false, message: 'Konfigurasi tersedia; folder SIPANDU akan diverifikasi/dibuat dengan OAuth pengguna saat unggah.' }, 200, origin);
    }

    if (url.pathname === '/documents' || url.pathname.startsWith('/documents/')) {
      if (missingConfiguration(env).length) return json({ ok: false, message: 'Layanan arsip belum dikonfigurasi administrator.' }, 503, origin);
      return handleStaffDocumentRoute(request, env, url, origin);
    }

    if (url.pathname !== '/archive' || request.method !== 'POST') {
      return json({ ok: false, message: 'Endpoint tidak ditemukan.' }, 404, origin);
    }
    if (missingConfiguration(env).length) {
      return json({ ok: false, message: 'Layanan arsip belum dikonfigurasi administrator.' }, 503, origin);
    }
    const authorization = request.headers.get('Authorization') || '';
    const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    const googleAccessToken = (request.headers.get('X-Google-Access-Token') || '').trim();
    if (!idToken) return json({ ok: false, message: 'Sesi Firebase tidak ditemukan.' }, 401, origin);
    if (!googleAccessToken) return json({ ok: false, message: 'Sesi Google Workspace tidak ditemukan. Hubungkan akun Google terlebih dahulu.' }, 401, origin);

    try {
      const contentLength = Number(request.headers.get('Content-Length') || 0);
      if (contentLength > MAX_PDF_BYTES + 128 * 1024) {
        return json({ ok: false, message: 'Ukuran permintaan melebihi batas arsip PDF 24 MiB.' }, 413, origin);
      }
      await lookupFirebaseUser(env, idToken);
      await verifyGoogleIdentity(googleAccessToken, env.GOOGLE_WORKSPACE_EMAIL!);
      const form = await request.formData();
      const ppksId = String(form.get('ppksId') || '').trim();
      const file = form.get('file');
      if (!(file instanceof File)) return json({ ok: false, message: 'PDF asesmen tidak ditemukan pada permintaan.' }, 400, origin);
      if (file.size > MAX_PDF_BYTES) return json({ ok: false, message: 'Ukuran PDF melebihi batas 24 MiB.' }, 413, origin);
      const result = await archivePdf(env, googleAccessToken, ppksId, file);
      const uploaded = result.file;
      return json({
        ok: true,
        verified: true,
        replacedExisting: result.replacedExisting,
        fileId: uploaded.id,
        fileName: uploaded.name,
        mimeType: uploaded.mimeType,
        size: Number(uploaded.size),
      }, 200, origin);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Arsip PDF belum dapat disimpan.';
      const status = /sesi firebase/i.test(message) ? 401
        : /token oauth google|sesi google workspace/i.test(message) ? 401
        : /peran sipandu|peran akun/i.test(message) ? 403
        : 502;
      return json({ ok: false, verified: false, message }, status, origin);
    }
  },
};

