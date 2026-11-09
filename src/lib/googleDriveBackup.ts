import { auth, getAccessToken, invalidateAccessToken, refreshWorkspaceAccessToken } from './firebase';
import type { SuratRecord } from '../types';
import { buildDriveUploadMetadata, buildGoogleDriveMultipartBody, buildGoogleDriveRequestUrl, buildResumableContentRange, parseResumableRangeOffset } from './googleDriveMultipart';
import { isManagedIntegratedAssessmentArchiveFile } from './integratedAssessmentArchive';

const ROOT_FOLDER_NAME = 'SIPANDU';
const DOCUMENTS_FOLDER_NAME = 'Dokumen';
const ASSESSMENTS_FOLDER_NAME = 'From Asesmen Terintegrasi';

function safeName(value: string, fallback: string): string {
  const cleaned = value.normalize('NFKC').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120);
  return cleaned || fallback;
}

async function driveFetch(path: string, init: RequestInit = {}, retry = true, uploadEndpoint = false): Promise<Response> {
  let token = await getAccessToken();
  if (!token) token = await refreshWorkspaceAccessToken();
  if (!token) {
    throw new Error('Google Drive belum terhubung. Hubungkan akun Google Workspace SIPANDU terlebih dahulu agar salinan backup dapat dibuat.');
  }

  const request = (accessToken: string) => fetch(buildGoogleDriveRequestUrl(path, uploadEndpoint), {
    ...init,
    headers: {
      Authorization: 'Bearer ' + accessToken,
      ...(init.headers || {}),
    },
  });

  let response = await request(token);
  if (response.status === 401 && retry) {
    invalidateAccessToken();
    const refreshed = await refreshWorkspaceAccessToken(true);
    if (refreshed) response = await request(refreshed);
  }
  return response;
}

async function getOrCreateFolder(name: string, parentId?: string): Promise<string> {
  const parentQuery = parentId ? ` and '${parentId.replace(/'/g, "\\'")}' in parents` : '';
  const query = encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and name='${name.replace(/'/g, "\\'")}' and trashed=false${parentQuery}`);
  const found = await driveFetch(`/files?q=${query}&fields=files(id,name)&pageSize=10`);
  if (!found.ok) throw new Error('Google Drive tidak dapat memeriksa folder SIPANDU (HTTP ' + found.status + ').');
  const payload = await found.json() as { files?: Array<{ id: string }> };
  if (payload.files?.[0]?.id) return payload.files[0].id;

  const created = await driveFetch('/files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
  if (!created.ok) {
    const error = await created.json().catch(() => ({}));
    throw new Error((error as { error?: { message?: string } }).error?.message || 'Folder Google Drive gagal dibuat.');
  }
  return (await created.json() as { id: string }).id;
}

async function ensureFolderPath(parts: string[]): Promise<string> {
  let parentId: string | undefined;
  for (const part of parts) parentId = await getOrCreateFolder(part, parentId);
  return parentId!;
}

const GOOGLE_DRIVE_MULTIPART_LIMIT = 5 * 1024 * 1024;
const GOOGLE_DRIVE_RESUMABLE_CHUNK_SIZE = 8 * 1024 * 1024; // 32 x 256 KiB
const MAX_RESUMABLE_RETRIES = 3;
type UploadedDriveFile = { id: string; name?: string; mimeType?: string; size?: string; webViewLink?: string };

async function readDriveError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json() as { error?: { message?: string }; message?: string };
    return payload.error?.message || payload.message || fallback + ' (HTTP ' + response.status + ').';
  } catch {
    return fallback + ' (HTTP ' + response.status + ').';
  }
}

async function getWorkspaceUploadToken(forceRefresh = false): Promise<string> {
  if (forceRefresh) invalidateAccessToken();
  let token = forceRefresh ? await refreshWorkspaceAccessToken(true) : await getAccessToken();
  if (!token) token = await refreshWorkspaceAccessToken(forceRefresh);
  if (!token) {
    throw new Error('Sesi Google Drive kedaluwarsa. Hubungkan kembali akun Google Workspace, lalu ulangi penyimpanan PDF.');
  }
  return token;
}

async function queryResumableUploadStatus(
  uploadUrl: string,
  totalSize: number,
  token: string,
): Promise<{ offset: number; completed?: UploadedDriveFile }> {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Range': 'bytes */' + totalSize,
    },
  });
  if (response.status === 308) {
    return { offset: parseResumableRangeOffset(response.headers.get('Range')) };
  }
  if (response.ok) {
    return { offset: totalSize, completed: await response.json() as UploadedDriveFile };
  }
  if (response.status === 404 || response.status === 410) {
    throw new Error('Sesi upload Google Drive telah kedaluwarsa. Ulangi penyimpanan PDF.');
  }
  throw new Error(await readDriveError(response, 'Status upload resumable Google Drive tidak dapat diperiksa.'));
}

/**
 * Upload in 8 MiB chunks (multiples of 256 KiB) and resume at bytes confirmed
 * by Google's Range response. No SIPANDU-specific maximum file size is imposed.
 */
async function uploadResumableChunks(
  uploadUrl: string,
  mimeType: string,
  data: Blob,
): Promise<UploadedDriveFile> {
  let offset = 0;
  let token = await getWorkspaceUploadToken();
  let retries = 0;
  let noProgressRetries = 0;

  while (offset < data.size) {
    const endExclusive = Math.min(offset + GOOGLE_DRIVE_RESUMABLE_CHUNK_SIZE, data.size);
    let response: Response;
    try {
      response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': mimeType,
          'Content-Range': buildResumableContentRange(offset, endExclusive, data.size),
        },
        body: data.slice(offset, endExclusive, mimeType),
      });
    } catch (networkError) {
      if (retries >= MAX_RESUMABLE_RETRIES) {
        throw new Error('Koneksi terputus saat mengunggah PDF ke Google Drive: ' +
          (networkError instanceof Error ? networkError.message : String(networkError)));
      }
      retries += 1;
      const status = await queryResumableUploadStatus(uploadUrl, data.size, token);
      if (status.completed) return status.completed;
      offset = status.offset;
      continue;
    }

    if (response.status === 401) {
      if (retries >= MAX_RESUMABLE_RETRIES) throw new Error('Otorisasi Google Drive terus ditolak saat upload PDF.');
      token = await getWorkspaceUploadToken(true);
      retries += 1;
      continue;
    }

    if (response.status === 308) {
      const nextOffset = parseResumableRangeOffset(response.headers.get('Range'));
      if (nextOffset > data.size) throw new Error('Google Drive mengembalikan posisi upload di luar ukuran PDF.');
      if (nextOffset <= offset) {
        noProgressRetries += 1;
        if (noProgressRetries > MAX_RESUMABLE_RETRIES) {
          throw new Error('Google Drive belum mengonfirmasi byte PDF yang terkirim. Ulangi penyimpanan saat koneksi stabil.');
        }
        const status = await queryResumableUploadStatus(uploadUrl, data.size, token);
        if (status.completed) return status.completed;
        offset = status.offset;
        continue;
      }
      noProgressRetries = 0;
      retries = 0;
      offset = nextOffset;
      continue;
    }

    if (response.ok) {
      const completed = await response.json() as UploadedDriveFile;
      if (completed.id) return completed;
      throw new Error('Google Drive menyelesaikan upload tetapi tidak mengembalikan ID berkas.');
    }

    if (response.status >= 500 && retries < MAX_RESUMABLE_RETRIES) {
      retries += 1;
      const status = await queryResumableUploadStatus(uploadUrl, data.size, token);
      if (status.completed) return status.completed;
      offset = status.offset;
      continue;
    }

    throw new Error(await readDriveError(response, 'Upload PDF resumable ke Google Drive gagal.'));
  }

  const finalStatus = await queryResumableUploadStatus(uploadUrl, data.size, token);
  if (finalStatus.completed) return finalStatus.completed;
  throw new Error('Upload PDF belum dikonfirmasi selesai oleh Google Drive.');
}

async function uploadMultipart(
  folderId: string,
  fileName: string,
  mimeType: string,
  data: Blob,
  existingFileId?: string,
): Promise<UploadedDriveFile> {
  if (!(data instanceof Blob) || data.size <= 0) {
    throw new Error('Berkas kosong dan tidak dapat diunggah ke Google Drive.');
  }
  const metadata = buildDriveUploadMetadata({ name: fileName, mimeType, folderId, existingFileId });
  const uploadPath = existingFileId ? '/files/' + encodeURIComponent(existingFileId) : '/files';
  const uploadMethod = existingFileId ? 'PATCH' : 'POST';
  const fields = 'id,name,mimeType,size,webViewLink';

  let uploaded: UploadedDriveFile;
  if (data.size > GOOGLE_DRIVE_MULTIPART_LIMIT) {
    const session = await driveFetch(uploadPath + '?uploadType=resumable&fields=' + fields, {
      method: uploadMethod,
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': String(data.size),
      },
      body: metadata,
    }, true, true);
    if (!session.ok) {
      throw new Error(await readDriveError(session, 'Sesi upload resumable Google Drive gagal dibuat.'));
    }
    const uploadUrl = session.headers.get('Location');
    if (!uploadUrl || !/^https:\/\/www\.googleapis\.com\/upload\/drive\/v3\//i.test(uploadUrl)) {
      throw new Error('Google Drive tidak mengembalikan alamat sesi upload yang valid.');
    }
    uploaded = await uploadResumableChunks(uploadUrl, mimeType, data);
  } else {
    const boundary = 'sipandu-' + crypto.randomUUID().replace(/-/g, '');
    const body = buildGoogleDriveMultipartBody(metadata, mimeType, data, boundary);
    const response = await driveFetch(
      uploadPath + '?uploadType=multipart&fields=' + fields,
      {
        method: uploadMethod,
        headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
        body,
      },
      true,
      true,
    );
    if (!response.ok) {
      throw new Error(await readDriveError(response, 'File gagal disalin ke Google Drive.'));
    }
    uploaded = await response.json() as UploadedDriveFile;
  }

  if (!uploaded.id) throw new Error('Google Drive menerima upload tetapi tidak mengembalikan ID file.');
  if (uploaded.mimeType && uploaded.mimeType !== mimeType) {
    throw new Error('Google Drive menyimpan berkas dengan tipe ' + uploaded.mimeType + ', bukan ' + mimeType + '.');
  }
  return {
    ...uploaded,
    webViewLink: uploaded.webViewLink || 'https://drive.google.com/open?id=' + encodeURIComponent(uploaded.id),
  };
}

/** Copies an uploaded staff document to the central SIPANDU Google Drive archive. */
export async function backupDocumentToCentralDrive(
  file: File,
  category: 'surat-tugas' | 'surat-lainnya',
): Promise<{ id: string; webViewLink?: string }> {
  const categoryFolder = category === 'surat-tugas' ? 'Surat Tugas' : 'Surat Lainnya';
  const folderId = await ensureFolderPath([ROOT_FOLDER_NAME, DOCUMENTS_FOLDER_NAME, categoryFolder]);
  return uploadMultipart(folderId, safeName(file.name, 'dokumen'), file.type || 'application/octet-stream', file);
}

/** Archives the structured content of a newly generated letter in the central Drive. */
export async function backupLetterToCentralDrive(record: SuratRecord): Promise<{ id: string; webViewLink?: string }> {
  const categoryFolder = record.jenis === 'Surat Tugas' ? 'Surat Tugas' : 'Surat Lainnya';
  const folderId = await ensureFolderPath([ROOT_FOLDER_NAME, DOCUMENTS_FOLDER_NAME, categoryFolder, 'Surat Dibuat']);
  const payload = new Blob([JSON.stringify({
    type: 'SIPANDU Surat',
    ...record,
    archivedAt: new Date().toISOString(),
  }, null, 2)], { type: 'application/json' });
  return uploadMultipart(folderId, safeName(record.nomorSurat + '-' + record.judul, record.id) + '.json', 'application/json', payload);
}

/**
 * Uploads the already-rendered official integrated-assessment PDF to the central
 * Drive archive. Raw answer JSON is intentionally never uploaded by this path.
 */
export async function backupAssessmentToCentralDrive(input: {
  ppksId: string;
  ppksName: string;
  nik?: string;
  fileName: string;
  existingFileId?: string;
  pdf: Blob;
}): Promise<{ id: string; webViewLink?: string; replacedExisting: boolean }> {
  if (!(input.pdf instanceof Blob) || input.pdf.size < 8) {
    throw new Error('Dokumen PDF asesmen kosong atau tidak valid.');
  }
  if ((await input.pdf.slice(0, 5).text()) !== '%PDF-') {
    throw new Error('Arsip Google Drive hanya menerima PDF A4 yang valid.');
  }

  const personFolder = safeName(input.ppksName || input.ppksId, input.ppksId);
  const folderId = await ensureFolderPath([ROOT_FOLDER_NAME, ASSESSMENTS_FOLDER_NAME, personFolder]);
  const requestedName = String(input.fileName || '').replace(/\\.pdf$/i, '');
  const fileName = safeName(
    requestedName || ('Form-Asesmen-Terintegrasi-' + personFolder + '-' + Date.now()),
    'Form-Asesmen-Terintegrasi-' + Date.now(),
  ) + '.pdf';

  // Reuse only an existing SIPANDU-owned PDF in this respondent's folder.
  // Legacy JSON files are deliberately never searched for, migrated or replaced.
  const trackedPdfIsReplaceable = input.existingFileId
    ? await isReplaceableAssessmentArchive(input.existingFileId, folderId)
    : false;
  const replaceFileId = trackedPdfIsReplaceable ? input.existingFileId : undefined;

  const uploaded = await uploadMultipart(
    folderId,
    fileName,
    'application/pdf',
    input.pdf,
    replaceFileId,
  );
  return { ...uploaded, replacedExisting: Boolean(replaceFileId) };
}

/** True only for an existing SIPANDU-managed PDF in the exact respondent folder. */
async function isReplaceableAssessmentArchive(fileId: string, folderId: string): Promise<boolean> {
  if (!fileId || !folderId) return false;
  try {
    const response = await driveFetch(
      '/files/' + encodeURIComponent(fileId) + '?fields=id,name,mimeType,appProperties,trashed',
    );
    if (!response.ok) return false;
    const file = await response.json() as {
      id?: string;
      name?: string;
      mimeType?: string;
      trashed?: boolean;
      appProperties?: Record<string, string>;
    };
    return file.id === fileId && file.mimeType === 'application/pdf'
      && isManagedIntegratedAssessmentArchiveFile(file, folderId);
  } catch {
    return false;
  }
}

/** Deletes a SIPANDU archive copy from the central Google Drive account. */
export async function deleteCentralDriveFile(fileId: string): Promise<void> {
  if (!fileId) return;
  const response = await driveFetch('/files/' + encodeURIComponent(fileId), { method: 'DELETE' });
  if (response.status === 404) return;
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error((error as { error?: { message?: string } }).error?.message || 'Salinan Google Drive gagal dihapus (HTTP ' + response.status + ').');
  }
}


const ASSESSMENT_ARCHIVE_WORKER_URL = 'https://sipandu-assessment-archive.aryprayoga139.workers.dev';

/**
 * Sends the already-rendered assessment PDF to the authenticated archive Worker.
 * Google service-account credentials and Drive access tokens never enter the client.
 */
export async function backupAssessmentViaArchiveWorker(input: {
  ppksId: string;
  pdf: Blob;
}): Promise<{ id: string; webViewLink: string }> {
  if (!input.ppksId || input.ppksId.length > 180 || input.ppksId.includes('/')) {
    throw new Error('ID responden tidak valid untuk pengarsipan PDF.');
  }
  if (!(input.pdf instanceof Blob) || input.pdf.type !== 'application/pdf' || input.pdf.size < 8) {
    throw new Error('PDF asesmen kosong atau tidak valid.');
  }
  if ((await input.pdf.slice(0, 5).text()) !== '%PDF-') {
    throw new Error('Isi berkas bukan PDF yang valid.');
  }
  const user = auth.currentUser;
  if (!user) throw new Error('Sesi akun SIPANDU berakhir. Masuk kembali sebelum mengarsipkan PDF.');
  const idToken = await user.getIdToken();

  const form = new FormData();
  form.set('ppksId', input.ppksId);
  form.set('file', input.pdf, 'assessment.pdf');
  const response = await fetch(ASSESSMENT_ARCHIVE_WORKER_URL + '/archive', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + idToken },
    body: form,
  });
  const payload = await response.json().catch(() => ({})) as {
    ok?: boolean;
    verified?: boolean;
    fileId?: string;
    mimeType?: string;
    size?: number;
    webViewLink?: string;
    message?: string;
  };
  if (!response.ok || payload.ok !== true || payload.verified !== true || !payload.fileId) {
    throw new Error(payload.message || 'Worker arsip SIPANDU belum dapat memverifikasi PDF di Google Drive (HTTP ' + response.status + ').');
  }
  if (payload.mimeType !== 'application/pdf' || Number(payload.size) !== input.pdf.size) {
    throw new Error('Verifikasi Google Drive tidak cocok dengan tipe atau ukuran PDF yang dikirim.');
  }
  const webViewLink = payload.webViewLink || ('https://drive.google.com/open?id=' + encodeURIComponent(payload.fileId));
  return { id: payload.fileId, webViewLink };
}
