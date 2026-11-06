import { getAccessToken, invalidateAccessToken, refreshWorkspaceAccessToken } from './firebase';
import type { SuratRecord } from '../types';
import { buildGoogleDriveMultipartBody, buildGoogleDriveRequestUrl } from './googleDriveMultipart';

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

async function uploadMultipart(
  folderId: string,
  fileName: string,
  mimeType: string,
  data: Blob,
  existingFileId?: string,
): Promise<{ id: string; webViewLink?: string }> {
  const metadata = JSON.stringify({
    name: fileName,
    parents: [folderId],
    appProperties: { sipanduManaged: 'true', sipanduArchive: folderId },
  });

  let uploaded: { id: string; webViewLink?: string };
  const uploadPath = existingFileId
    ? '/files/' + encodeURIComponent(existingFileId)
    : '/files';
  const uploadMethod = existingFileId ? 'PATCH' : 'POST';
  if (data.size > 5 * 1024 * 1024) {
    // Resumable upload avoids holding a second multipart copy in mobile memory.
    const session = await driveFetch(uploadPath + '?uploadType=resumable&fields=id,name,webViewLink', {
      method: uploadMethod,
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': String(data.size),
      },
      body: metadata,
    }, true, true);
    if (!session.ok) {
      const error = await session.json().catch(() => ({}));
      throw new Error((error as { error?: { message?: string } }).error?.message || 'Sesi upload Google Drive gagal dibuat.');
    }
    const uploadUrl = session.headers.get('Location');
    if (!uploadUrl) throw new Error('Google Drive tidak mengembalikan alamat sesi upload.');
    let token = await getAccessToken();
    if (!token) token = await refreshWorkspaceAccessToken();
    if (!token) throw new Error('Sesi Google Drive kedaluwarsa. Hubungkan kembali akun Google Workspace, lalu ulangi backup.');
    let response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': mimeType },
      body: data,
    });
    if (response.status === 401) {
      invalidateAccessToken();
      token = await refreshWorkspaceAccessToken(true);
      if (token) {
        response = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': mimeType },
          body: data,
        });
      }
    }
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error((error as { error?: { message?: string } }).error?.message || 'Upload resumable Google Drive gagal (HTTP ' + response.status + ').');
    }
    uploaded = await response.json() as { id: string; webViewLink?: string };
  } else {
    const boundary = 'sipandu-' + Math.random().toString(36).slice(2);
    const body = buildGoogleDriveMultipartBody(metadata, mimeType, data, boundary);

    const response = await driveFetch(uploadPath + '?uploadType=multipart&fields=id,name,webViewLink', {
      method: uploadMethod,
      headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
      body,
    }, true, true);
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error((error as { error?: { message?: string } }).error?.message || 'File gagal disalin ke Google Drive.');
    }
    uploaded = await response.json() as { id: string; webViewLink?: string };
  }
  if (!uploaded.id) throw new Error('Google Drive menerima upload tetapi tidak mengembalikan ID file.');
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
}): Promise<{ id: string; webViewLink?: string }> {
  if (!(input.pdf instanceof Blob) || input.pdf.size < 8) {
    throw new Error('Dokumen PDF asesmen kosong atau tidak valid.');
  }
  const header = await input.pdf.slice(0, 5).text();
  if (header !== '%PDF-') {
    throw new Error('Arsip Google Drive hanya menerima PDF resmi, bukan JSON atau data mentah.');
  }

  const personFolder = safeName(input.ppksName || input.ppksId, input.ppksId);
  const folderId = await ensureFolderPath([ROOT_FOLDER_NAME, ASSESSMENTS_FOLDER_NAME, personFolder]);
  const savedAt = new Date().toISOString();
  const stamp = savedAt.replace(/[:.]/g, '-');
  const respondent = safeName(input.ppksName || input.ppksId, input.ppksId);
  const nik = safeName(input.nik || '', 'tanpa-NIK');
  const requestedName = String(input.fileName || '').replace(/\.pdf$/i, '');
  const fileName = safeName(
    requestedName || ('Form-Asesmen-Terintegrasi-' + respondent + '-' + nik + '-' + stamp),
    'Form-Asesmen-Terintegrasi-' + stamp,
  ) + '.pdf';

  // Migrate the last tracked SIPANDU JSON/PDF snapshot in-place when it
  // belongs to this respondent's archive. Unknown files are never overwritten.
  const replaceExisting = input.existingFileId
    ? await isReplaceableAssessmentArchive(input.existingFileId, folderId)
    : false;
  return uploadMultipart(
    folderId,
    fileName,
    'application/pdf',
    input.pdf,
    replaceExisting ? input.existingFileId : undefined,
  );
}

async function isReplaceableAssessmentArchive(fileId: string, folderId: string): Promise<boolean> {
  if (!fileId) return false;
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
    if (file.trashed || file.id !== fileId) return false;
    if (file.appProperties?.sipanduManaged !== 'true'
      || file.appProperties?.sipanduArchive !== folderId) return false;
    const isPreviousJson = file.mimeType === 'application/json'
      && /^asesmen-.*\.json$/i.test(file.name || '');
    const isPreviousPdf = file.mimeType === 'application/pdf'
      && /^form-asesmen-terintegrasi-.*\.pdf$/i.test(file.name || '');
    return isPreviousJson || isPreviousPdf;
  } catch {
    // Never block a new PDF because an old file cannot be inspected.
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
