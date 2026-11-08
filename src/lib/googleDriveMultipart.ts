const GOOGLE_DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const GOOGLE_DRIVE_UPLOAD_API_BASE = 'https://www.googleapis.com/upload/drive/v3';

/** Build the correct Drive v3 URL for metadata requests or media uploads. */
export function buildGoogleDriveRequestUrl(path: string, upload = false): string {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error('Invalid Google Drive API path.');
  }
  return (upload ? GOOGLE_DRIVE_UPLOAD_API_BASE : GOOGLE_DRIVE_API_BASE) + path;
}

export function buildGoogleDriveMultipartBody(
  metadataJson: string,
  mimeType: string,
  data: Blob,
  boundary: string,
): Blob {
  if (!/^[A-Za-z0-9'()+_,\-./:=?]{1,70}$/.test(boundary)) {
    throw new Error('Invalid multipart boundary.');
  }
  if (!mimeType || /[\r\n]/.test(mimeType)) {
    throw new Error('Invalid multipart content type.');
  }

  return new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    metadataJson,
    `\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    data,
    `\r\n--${boundary}--\r\n`,
  ], { type: `multipart/related; boundary=${boundary}` });
}


/** Build Drive metadata explicitly, including the file MIME type. */
export function buildDriveUploadMetadata(input: {
  name: string;
  mimeType: string;
  folderId: string;
  existingFileId?: string;
}): string {
  if (!input.name || /[\\r\\n]/.test(input.name)) {
    throw new Error('Nama file Google Drive tidak valid.');
  }
  if (!input.mimeType || /[\\r\\n]/.test(input.mimeType)) {
    throw new Error('Tipe file Google Drive tidak valid.');
  }
  if (!input.folderId || /[\\r\\n]/.test(input.folderId)) {
    throw new Error('Folder tujuan Google Drive tidak valid.');
  }
  return JSON.stringify({
    name: input.name,
    mimeType: input.mimeType,
    // Google Drive does not allow files.update to move an existing file.
    ...(!input.existingFileId ? { parents: [input.folderId] } : {}),
    appProperties: { sipanduManaged: 'true', sipanduArchive: input.folderId },
  });
}

/** Return the inclusive Content-Range header for an exclusive end offset. */
export function buildResumableContentRange(start: number, endExclusive: number, total: number): string {
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(endExclusive) ||
    !Number.isSafeInteger(total) ||
    total <= 0 ||
    start < 0 ||
    endExclusive <= start ||
    endExclusive > total
  ) throw new Error('Rentang byte upload Google Drive tidak valid.');
  return 'bytes ' + start + '-' + (endExclusive - 1) + '/' + total;
}

/** Parse Google's Range response (bytes=0-N) to the next unsent byte offset. */
export function parseResumableRangeOffset(range: string | null): number {
  if (!range) return 0;
  const match = range.trim().match(/^bytes=0-(\\d+)$/i);
  if (!match) throw new Error('Header Range dari Google Drive tidak valid.');
  const lastReceived = Number(match[1]);
  if (!Number.isSafeInteger(lastReceived) || lastReceived < 0) {
    throw new Error('Posisi upload Google Drive tidak valid.');
  }
  return lastReceived + 1;
}
