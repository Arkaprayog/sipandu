import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, FileImage, ImageOff, LoaderCircle } from 'lucide-react';
import { getAccessToken, invalidateAccessToken, refreshWorkspaceAccessToken } from '../lib/firebase';
import { createPhotoPreviewBlob, detectPhotoFileFormat, MAX_PPKS_PHOTO_FILE_BYTES } from '../lib/photoFilePreview';

interface PrivateDriveImageProps {
  source?: string | null;
  alt: string;
  className?: string;
  objectFit?: 'cover' | 'contain';
}

function firstLink(value: string): string {
  const trimmed = value.trim();
  const markdown = trimmed.match(/\]\((https?:\/\/[^)]+)\)/);
  if (markdown) return markdown[1];
  const url = trimmed.match(/https?:\/\/[^\s,;]+/i);
  return (url?.[0] || trimmed).replace(/[)\]}>.,]+$/, '');
}

function driveFileId(value: string): string | null {
  const source = firstLink(value);
  const pathMatch = source.match(/\/(?:file\/)?d\/([a-zA-Z0-9_-]{15,})/);
  if (pathMatch) return pathMatch[1];
  const driveFilesPath = source.match(/\/drive\/u\/\d+\/files\/([a-zA-Z0-9_-]{15,})/);
  if (driveFilesPath) return driveFilesPath[1];
  const queryMatch = source.match(/[?&](?:id|fileId)=([a-zA-Z0-9_-]{15,})/);
  if (queryMatch && /drive\.google\.com|docs\.google\.com/i.test(source)) return queryMatch[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(source)) return source;
  return null;
}

function fileNameFromUrl(value: string): string {
  try {
    const url = new URL(value);
    const last = url.pathname.split('/').filter(Boolean).pop() || '';
    return decodeURIComponent(last) || 'photo';
  } catch {
    return 'photo';
  }
}

function formatTitle(fileName: string, mimeType: string, bytes: ArrayBuffer): string {
  const format = detectPhotoFileFormat(fileName, mimeType, bytes);
  const labels: Record<string, string> = {
    jpeg: 'JPG', png: 'PNG', gif: 'GIF', webp: 'WEBP', bmp: 'BMP',
    tiff: 'TIFF', heic: 'HEIC / HEIF', psd: 'PSD', raw: 'RAW',
    pdf: 'PDF • halaman pertama', doc: 'DOC • foto/isi dokumen',
    docx: 'DOCX • foto/isi dokumen',
  };
  return format ? labels[format] || 'PRATINJAU' : 'PRATINJAU';
}

export const PrivateDriveImage: React.FC<PrivateDriveImageProps> = ({
  source,
  alt,
  className = 'h-40 w-full',
  objectFit = 'cover',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'missing' | 'error'>('idle');
  const [errorText, setErrorText] = useState('');
  const [formatLabel, setFormatLabel] = useState('');
  const [workspaceTokenRevision, setWorkspaceTokenRevision] = useState(0);

  const cleanedSource = source ? firstLink(String(source)) : '';
  const driveId = cleanedSource ? driveFileId(cleanedSource) : null;
  const originalFileUrl = driveId
    ? 'https://drive.google.com/file/d/' + driveId + '/view'
    : (/^https?:\/\//i.test(cleanedSource) ? cleanedSource : '');

  useEffect(() => {
    const onTokenUpdated = () => setWorkspaceTokenRevision((revision) => revision + 1);
    window.addEventListener('sipandu-workspace-token-updated', onTokenUpdated);
    return () => window.removeEventListener('sipandu-workspace-token-updated', onTokenUpdated);
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    if (typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setShouldLoad(true);
        observer.disconnect();
      }
    }, { rootMargin: '180px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    let objectUrl = '';
    setImageUrl('');
    setErrorText('');
    setFormatLabel('');

    if (!cleanedSource) {
      setStatus('missing');
      return () => { active = false; };
    }
    if (!shouldLoad) return () => { active = false; };

    setStatus('loading');
    void (async () => {
      try {
        let fileBlob: Blob;
        let fileName = fileNameFromUrl(cleanedSource);
        let mimeType = '';

        if (driveId) {
          let token = await getAccessToken();
          if (!token) token = await refreshWorkspaceAccessToken();
          if (!token) throw new Error('Sesi Google Workspace belum tersedia untuk membaca file foto privat.');

          const driveRequest = async (url: string) => {
            let response = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
            if (response.status === 401) {
              invalidateAccessToken();
              const refreshed = await refreshWorkspaceAccessToken(true);
              if (refreshed) {
                token = refreshed;
                response = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
              }
            }
            return response;
          };

          const metadataResponse = await driveRequest(
            'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(driveId) + '?fields=id,name,mimeType,size'
          );
          if (!metadataResponse.ok) {
            const payload = await metadataResponse.json().catch(() => ({}));
            const message = (payload as { error?: { message?: string } }).error?.message;
            if (metadataResponse.status === 401) throw new Error('Token Google Drive ditolak setelah percobaan pemulihan otomatis.');
            if (metadataResponse.status === 403) throw new Error('Akun Workspace tidak memiliki izin membaca file ini. Periksa akses file pada Google Drive.');
            throw new Error(message || 'Metadata file Google Drive tidak dapat dibaca (HTTP ' + metadataResponse.status + ').');
          }
          const metadata = await metadataResponse.json() as { name?: string; mimeType?: string; size?: string };
          fileName = metadata.name || fileName;
          mimeType = metadata.mimeType || '';
          const remoteSize = Number(metadata.size || 0);
          if (remoteSize > MAX_PPKS_PHOTO_FILE_BYTES) {
            throw new Error('Ukuran file lebih dari 30 MB. File tidak diproses agar memori ponsel tetap aman.');
          }

          const mediaResponse = await driveRequest(
            'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(driveId) + '?alt=media'
          );
          if (!mediaResponse.ok) {
            const payload = await mediaResponse.json().catch(() => ({}));
            const message = (payload as { error?: { message?: string } }).error?.message;
            if (mediaResponse.status === 401) throw new Error('Token Google Drive ditolak setelah percobaan pemulihan otomatis.');
            if (mediaResponse.status === 403) throw new Error('Akun Workspace tidak memiliki izin membaca isi file. Periksa akses file pada Google Drive.');
            throw new Error(message || 'Isi file Google Drive tidak dapat diunduh (HTTP ' + mediaResponse.status + ').');
          }
          fileBlob = await mediaResponse.blob();
          if (!mimeType) mimeType = fileBlob.type;
        } else {
          try {
            const directResponse = await fetch(cleanedSource);
            if (!directResponse.ok) throw new Error('HTTP ' + directResponse.status);
            fileBlob = await directResponse.blob();
            mimeType = fileBlob.type;
          } catch {
            if (/^(https?:\/\/|data:image\/)/i.test(cleanedSource)) {
              if (!active) return;
              setImageUrl(cleanedSource);
              setFormatLabel('Gambar eksternal');
              setStatus('ready');
              return;
            }
            throw new Error('Tautan sumber tidak dapat dibaca.');
          }
          if (fileBlob.size > MAX_PPKS_PHOTO_FILE_BYTES) {
            throw new Error('Ukuran file lebih dari 30 MB. File tidak diproses agar memori ponsel tetap aman.');
          }
        }

        const headerBytes = await fileBlob.slice(0, 32).arrayBuffer();
        const nextFormatLabel = formatTitle(fileName, mimeType, headerBytes);
        const previewBlob = await createPhotoPreviewBlob(fileBlob, fileName, mimeType);
        objectUrl = URL.createObjectURL(previewBlob);
        if (!active) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setFormatLabel(nextFormatLabel);
        setImageUrl(objectUrl);
        setStatus('ready');
      } catch (error) {
        if (!active) return;
        setStatus('error');
        setErrorText(error instanceof Error ? error.message : String(error));
      }
    })();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [cleanedSource, driveId, shouldLoad, workspaceTokenRevision]);

  return (
    <div ref={containerRef} className={'relative overflow-hidden rounded-lg bg-black/40 border border-white/15 ' + className}>
      {status === 'ready' && imageUrl ? (
        <>
          <img
            src={imageUrl}
            alt={alt}
            loading="lazy"
            className={'h-full w-full ' + (objectFit === 'contain' ? 'object-contain' : 'object-cover')}
            onError={() => {
              setStatus('error');
              setErrorText('Pratinjau tidak dapat ditampilkan. Periksa apakah file rusak atau formatnya didukung.');
            }}
          />
          {formatLabel && (
            <span className="absolute left-1.5 top-1.5 max-w-[85%] truncate rounded bg-black/75 px-1.5 py-0.5 text-[8px] font-bold text-white">
              {formatLabel}
            </span>
          )}
          {originalFileUrl && (
            <button
              type="button"
              title="Buka file asli"
              aria-label="Buka file asli"
              onClick={() => window.open(originalFileUrl, '_blank', 'noopener,noreferrer')}
              className="absolute bottom-1.5 right-1.5 rounded-md border border-white/20 bg-black/75 p-1.5 text-white shadow"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          )}
        </>
      ) : (
        <div className="flex h-full min-h-24 flex-col items-center justify-center gap-2 px-3 py-4 text-center text-neutral-300">
          {status === 'loading'
            ? <LoaderCircle className="h-5 w-5 animate-spin text-sky-300" />
            : status === 'error'
              ? <ImageOff className="h-5 w-5 text-rose-300" />
              : <FileImage className="h-5 w-5 text-neutral-500" />}
          <span className="text-[10px] leading-snug">
            {status === 'loading' ? 'Membaca format dan menyiapkan pratinjau…' :
              status === 'missing' ? 'Foto belum tersedia di sumber data' :
                status === 'error' ? (errorText || 'File tidak dapat ditampilkan') :
                  'Pratinjau dimuat saat terlihat'}
          </span>
          {originalFileUrl && status === 'error' && (
            <button type="button" onClick={() => window.open(originalFileUrl, '_blank', 'noopener,noreferrer')} className="text-[10px] font-semibold text-sky-200 underline">
              Buka file asli
            </button>
          )}
        </div>
      )}
    </div>
  );
};
