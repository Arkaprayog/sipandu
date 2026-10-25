import React, { useEffect, useRef, useState } from 'react';
import { ImageOff, LoaderCircle } from 'lucide-react';
import { getAccessToken } from '../lib/firebase';

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
  return (url?.[0] || trimmed).replace(/[)\]}]+$/, '');
}

function driveFileId(value: string): string | null {
  const source = firstLink(value);
  const pathMatch = source.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (pathMatch) return pathMatch[1];
  const queryMatch = source.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (queryMatch && /drive\.google\.com|docs\.google\.com/i.test(source)) return queryMatch[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(source)) return source;
  return null;
}

/**
 * Renders public image URLs directly and private Google Drive upload links by
 * fetching their bytes with the authorized Workspace token. No fake person/photo
 * is substituted when a real respondent photo is missing or inaccessible.
 */
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
  const [workspaceTokenRevision, setWorkspaceTokenRevision] = useState(0);

  const cleanedSource = source ? firstLink(String(source)) : '';

  useEffect(() => {
    const onTokenUpdated = () => setWorkspaceTokenRevision((revision) => revision + 1);
    window.addEventListener('sipandu-workspace-token-updated', onTokenUpdated);
    return () => window.removeEventListener('sipandu-workspace-token-updated', onTokenUpdated);
  }, []);
  const driveId = cleanedSource ? driveFileId(cleanedSource) : null;

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

    if (!cleanedSource) {
      setStatus('missing');
      return () => { active = false; };
    }
    if (!shouldLoad) return () => { active = false; };

    if (!driveId && /^(https?:|data:image\/)/i.test(cleanedSource)) {
      setImageUrl(cleanedSource);
      setStatus('ready');
      return () => { active = false; };
    }
    if (!driveId) {
      setStatus('error');
      setErrorText('Kolom foto tidak berisi URL gambar atau ID file Google Drive.');
      return () => { active = false; };
    }

    setStatus('loading');
    void (async () => {
      try {
        const token = await getAccessToken();
        if (!token) throw new Error('Izin Google Drive telah berakhir. Hubungkan ulang akun Google untuk melihat foto privat.');
        const response = await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveId)}?alt=media`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          const message = (payload as { error?: { message?: string } }).error?.message;
          throw new Error(message || `Google Drive menolak akses foto (HTTP ${response.status}).`);
        }
        const blob = await response.blob();
        if (!blob.type.startsWith('image/')) {
          throw new Error('File Drive yang ditautkan bukan file gambar yang bisa ditampilkan.');
        }
        objectUrl = URL.createObjectURL(blob);
        if (!active) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
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
    <div ref={containerRef} className={`relative overflow-hidden rounded-lg bg-black/40 border border-white/15 ${className}`}>
      {status === 'ready' && imageUrl ? (
        <img
          src={imageUrl}
          alt={alt}
          loading="lazy"
          className={`h-full w-full ${objectFit === 'contain' ? 'object-contain' : 'object-cover'}`}
          onError={() => {
            setStatus('error');
            setErrorText('Gambar tidak dapat ditampilkan. Periksa format file dan izin akses Google Drive.');
          }}
        />
      ) : (
        <div className="flex h-full min-h-24 flex-col items-center justify-center gap-2 px-3 py-4 text-center text-neutral-300">
          {status === 'loading' ? <LoaderCircle className="h-5 w-5 animate-spin text-sky-300" /> : <ImageOff className="h-5 w-5 text-neutral-500" />}
          <span className="text-[10px] leading-snug">
            {status === 'loading' ? 'Memuat foto privat…' :
              status === 'missing' ? 'Foto belum tersedia di sumber data' :
              status === 'error' ? (errorText || 'Foto tidak dapat ditampilkan') :
              'Foto dimuat saat terlihat'}
          </span>
        </div>
      )}
    </div>
  );
};
