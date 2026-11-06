import { getAccessToken, invalidateAccessToken, refreshWorkspaceAccessToken } from './firebase';
import type { SuratRecord } from '../types';
import { buildGoogleDriveMultipartBody, buildGoogleDriveRequestUrl } from './googleDriveMultipart';
import { isIntegratedAssessmentAnswerKey, isManagedIntegratedAssessmentArchiveFile } from './integratedAssessmentArchive';

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
    // Drive files.update does not allow changing parent folders here; keep
    // the existing file in its current archive folder during in-place migration.
    ...(!existingFileId ? { parents: [folderId] } : {}),
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
  existingFolderId?: string;
  requireExistingFileMatch?: boolean;
  pdf: Blob;
}): Promise<{ id: string; webViewLink?: string; replacedExisting: boolean }> {
  if (!(input.pdf instanceof Blob) || input.pdf.size < 8) {
    throw new Error('Dokumen PDF asesmen kosong atau tidak valid.');
  }
  const header = await input.pdf.slice(0, 5).text();
  if (header !== '%PDF-') {
    throw new Error('Arsip Google Drive hanya menerima PDF resmi, bukan JSON atau data mentah.');
  }

  const personFolder = safeName(input.ppksName || input.ppksId, input.ppksId);
  const folderId = input.existingFolderId || await ensureFolderPath([ROOT_FOLDER_NAME, ASSESSMENTS_FOLDER_NAME, personFolder]);
  const savedAt = new Date().toISOString();
  const stamp = savedAt.replace(/[:.]/g, '-');
  const respondent = safeName(input.ppksName || input.ppksId, input.ppksId);
  const nik = safeName(input.nik || '', 'tanpa-NIK');
  const requestedName = String(input.fileName || '').replace(/\.pdf$/i, '');
  const fileName = safeName(
    requestedName || ('Form-Asesmen-Terintegrasi-' + respondent + '-' + nik + '-' + stamp),
    'Form-Asesmen-Terintegrasi-' + stamp,
  ) + '.pdf';

  // Prefer the Firestore-tracked archive. If its pointer is missing or stale,
  // locate a legacy SIPANDU JSON in this exact respondent folder. The helper
  // verifies private appProperties before any existing Drive file is replaced.
  const trackedFileIsReplaceable = input.existingFileId
    ? await isReplaceableAssessmentArchive(input.existingFileId, folderId)
    : false;
  if (input.requireExistingFileMatch && !trackedFileIsReplaceable) {
    throw new Error('Arsip lama tidak lolos validasi kepemilikan SIPANDU. File JSON asli tidak diubah.');
  }
  const replaceFileId = trackedFileIsReplaceable
    ? input.existingFileId
    : input.requireExistingFileMatch
      ? undefined
      : await findLatestLegacyAssessmentArchive(folderId);
  const uploaded = await uploadMultipart(
    folderId,
    fileName,
    'application/pdf',
    input.pdf,
    replaceFileId,
  );
  return { ...uploaded, replacedExisting: Boolean(replaceFileId) };
}

export interface LegacyIntegratedAssessmentDriveArchive {
  fileId: string;
  fileName: string;
  parentFolderId: string;
  ppksId: string;
  ppksName: string;
  nik: string;
  savedAt: string;
  answers: Record<string, string | string[]>;
}

/** Lists old SIPANDU JSON snapshots only inside its assessment root/respondent folders. */
export async function listLegacyIntegratedAssessmentDriveArchives(): Promise<LegacyIntegratedAssessmentDriveArchive[]> {
  const assessmentRootId = await ensureFolderPath([ROOT_FOLDER_NAME, ASSESSMENTS_FOLDER_NAME]);
  const folders: Array<{ id: string; name: string }> = [];
  let folderPageToken = '';
  do {
    const params = new URLSearchParams({
      q: "'" + assessmentRootId.replace(/'/g, "\\'") + "' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'",
      pageSize: '100',
      orderBy: 'name',
      fields: 'nextPageToken,files(id,name,mimeType)',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });
    if (folderPageToken) params.set('pageToken', folderPageToken);
    const response = await driveFetch('/files?' + params.toString());
    if (!response.ok) throw new Error('Folder arsip asesmen Google Drive gagal dibaca (HTTP ' + response.status + ').');
    const page = await response.json() as {
      files?: Array<{ id: string; name: string; mimeType?: string }>;
      nextPageToken?: string;
    };
    folders.push(...(page.files || []).filter((file) => file.mimeType === 'application/vnd.google-apps.folder'));
    folderPageToken = page.nextPageToken || '';
  } while (folderPageToken);

  const archives: LegacyIntegratedAssessmentDriveArchive[] = [];
  for (const folder of folders) {
    let pageToken = '';
    do {
      const params = new URLSearchParams({
        q: "'" + folder.id.replace(/'/g, "\\'") + "' in parents and trashed = false and mimeType = 'application/json' and name contains 'asesmen-'",
        pageSize: '100',
        orderBy: 'modifiedTime',
        fields: 'nextPageToken,files(id,name,mimeType,appProperties,trashed,modifiedTime)',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const response = await driveFetch('/files?' + params.toString());
      if (!response.ok) throw new Error('Arsip JSON pada folder responden gagal diperiksa (HTTP ' + response.status + ').');
      const page = await response.json() as {
        files?: Array<{
          id: string;
          name: string;
          mimeType?: string;
          trashed?: boolean;
          appProperties?: Record<string, string>;
        }>;
        nextPageToken?: string;
      };

      const eligible = (page.files || []).filter((file) =>
        isManagedIntegratedAssessmentArchiveFile(file, folder.id)
      );
      for (const file of eligible) {
        try {
          const contentResponse = await driveFetch('/files/' + encodeURIComponent(file.id) + '?alt=media');
          if (!contentResponse.ok) throw new Error('Isi arsip gagal dibaca (HTTP ' + contentResponse.status + ').');
          const payload = await contentResponse.json() as {
            type?: string;
            ppksId?: string;
            ppksName?: string;
            nik?: string;
            savedAt?: string;
            answers?: Record<string, unknown>;
          };
          if (payload.type !== 'SIPANDU Form Asesmen Terintegrasi'
            || typeof payload.ppksId !== 'string'
            || !payload.ppksId.trim()
            || !payload.answers
            || typeof payload.answers !== 'object'
            || Array.isArray(payload.answers)) continue;

          const answers: Record<string, string | string[]> = {};
          for (const [key, value] of Object.entries(payload.answers)) {
            if (!isIntegratedAssessmentAnswerKey(key)) continue;
            if (typeof value === 'string') answers[key] = value;
            else if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
              answers[key] = value as string[];
            }
          }
          if (!Object.keys(answers).length) continue;

          archives.push({
            fileId: file.id,
            fileName: file.name,
            parentFolderId: folder.id,
            ppksId: payload.ppksId,
            ppksName: String(payload.ppksName || folder.name),
            nik: String(payload.nik || ''),
            savedAt: String(payload.savedAt || ''),
            answers,
          });
        } catch (error) {
          console.warn('SIPANDU skipped one legacy assessment archive that could not be parsed:', {
            fileId: file.id,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
      pageToken = page.nextPageToken || '';
    } while (pageToken);
  }

  return archives.sort((a, b) => {
    const left = Date.parse(a.savedAt) || 0;
    const right = Date.parse(b.savedAt) || 0;
    return left - right || a.fileName.localeCompare(b.fileName);
  });
}

async function findLatestLegacyAssessmentArchive(folderId: string): Promise<string | undefined> {
  try {
    const escapedFolderId = folderId.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const query = encodeURIComponent(
      "'" + escapedFolderId + "' in parents and trashed = false and mimeType = 'application/json' and name contains 'asesmen-'",
    );
    const response = await driveFetch(
      '/files?q=' + query
        + '&fields=files(id,name,mimeType,appProperties,trashed,modifiedTime)'
        + '&orderBy=modifiedTime desc&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true',
    );
    if (!response.ok) return undefined;
    const payload = await response.json() as { files?: Array<{
      id?: string;
      name?: string;
      mimeType?: string;
      trashed?: boolean;
      appProperties?: Record<string, string>;
    }> };
    const candidates = (payload.files || []).filter((file) =>
      file.mimeType === 'application/json'
      && /^asesmen-.*\.json$/i.test(file.name || '')
      && isManagedIntegratedAssessmentArchiveFile(file, folderId)
    );
    return candidates[0]?.id;
  } catch (error) {
    console.warn('SIPANDU could not locate the legacy assessment JSON archive; a new PDF will still be uploaded:', error);
    return undefined;
  }
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
    return file.id === fileId && isManagedIntegratedAssessmentArchiveFile(file, folderId);
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
