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
