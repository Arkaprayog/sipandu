export type PhotoFileFormat =
  | 'jpeg' | 'png' | 'gif' | 'webp' | 'bmp' | 'tiff'
  | 'heic' | 'psd' | 'raw' | 'pdf' | 'doc' | 'docx';

export const MAX_PPKS_PHOTO_FILE_BYTES = 30 * 1024 * 1024;
export const PPKS_PHOTO_ACCEPT = [
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tif', '.tiff',
  '.heic', '.heif', '.psd', '.raw', '.3fr', '.ari', '.arw', '.bay',
  '.cap', '.cr2', '.cr3', '.dcs', '.dcr', '.dng', '.drf', '.eip',
  '.erf', '.fff', '.gpr', '.iiq', '.k25', '.kdc', '.mdc', '.mef',
  '.mos', '.mrw', '.nef', '.nrw', '.obm', '.orf', '.pef', '.ptx',
  '.pxn', '.r3d', '.raf', '.rw2', '.rwl', '.sr2', '.srf', '.sti',
  '.pdf', '.doc', '.docx',
].join(',');

const RAW_EXTENSIONS = new Set([
  '3fr', 'ari', 'arw', 'bay', 'cap', 'cr2', 'cr3', 'dcs', 'dcr',
  'dng', 'drf', 'eip', 'erf', 'fff', 'gpr', 'iiq', 'k25', 'kdc',
  'mdc', 'mef', 'mos', 'mrw', 'nef', 'nrw', 'obm', 'orf', 'pef',
  'ptx', 'pxn', 'r3d', 'raf', 'raw', 'rw2', 'rwl', 'sr2', 'srf', 'sti',
]);

function extensionOf(fileName: string): string {
  const match = String(fileName || '').trim().toLowerCase().match(/\.([a-z0-9]{2,8})$/);
  return match?.[1] || '';
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

/** Identify the actual file from its signature first, then use its name/MIME as fallback. */
export function detectPhotoFileFormat(
  fileName: string,
  mimeType = '',
  source?: ArrayBuffer | Uint8Array,
): PhotoFileFormat | null {
  const ext = extensionOf(fileName);
  const bytes = source instanceof Uint8Array
    ? source
    : source instanceof ArrayBuffer ? new Uint8Array(source) : null;

  if (bytes && bytes.length >= 4) {
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
    if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG') return 'png';
    if (ascii(bytes, 0, 3) === 'GIF') return 'gif';
    if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'webp';
    if (ascii(bytes, 0, 2) === 'BM') return 'bmp';
    if (ascii(bytes, 0, 4) === '8BPS') return 'psd';
    if (ascii(bytes, 0, 4) === '%PDF') return 'pdf';
    if (
      (ascii(bytes, 0, 2) === 'II' && (bytes[2] === 42 || bytes[2] === 43)) ||
      (ascii(bytes, 0, 2) === 'MM' && bytes[2] === 0 && (bytes[3] === 42 || bytes[3] === 43))
    ) {
      if (RAW_EXTENSIONS.has(ext)) return 'raw';
      return 'tiff';
    }
    if (ascii(bytes, 0, 4) === 'PK\u0003\u0004' && ext === 'docx') return 'docx';
    if (
      bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 &&
      bytes[3] === 0xe0 && ext === 'doc'
    ) return 'doc';
    if (bytes.length >= 12 && ascii(bytes, 4, 4) === 'ftyp') {
      const brand = ascii(bytes, 8, 4).toLowerCase();
      if (/(heic|heix|hevc|hevx|mif1|msf1|heif)/.test(brand)) return 'heic';
      if (/(avif|avis)/.test(brand)) return 'heic';
    }
  }

  if (RAW_EXTENSIONS.has(ext)) return 'raw';
  const byExtension: Record<string, PhotoFileFormat> = {
    jpg: 'jpeg', jpeg: 'jpeg', jpe: 'jpeg', png: 'png', gif: 'gif',
    webp: 'webp', bmp: 'bmp', dib: 'bmp', tif: 'tiff', tiff: 'tiff',
    heic: 'heic', heif: 'heic', psd: 'psd', pdf: 'pdf',
    doc: 'doc', docx: 'docx',
  };
  if (byExtension[ext]) return byExtension[ext];

  const mime = String(mimeType || '').toLowerCase().split(';')[0].trim();
  const byMime: Record<string, PhotoFileFormat> = {
    'image/jpeg': 'jpeg', 'image/jpg': 'jpeg', 'image/png': 'png',
    'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp',
    'image/x-ms-bmp': 'bmp', 'image/tiff': 'tiff', 'image/x-tiff': 'tiff',
    'image/heic': 'heic', 'image/heif': 'heic', 'image/heic-sequence': 'heic',
    'image/heif-sequence': 'heic', 'image/vnd.adobe.photoshop': 'psd',
    'application/pdf': 'pdf', 'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  };
  return byMime[mime] || null;
}

export function isSupportedPhotoFile(
  file: Pick<File, 'name' | 'type' | 'size'>,
): boolean {
  return file.size > 0 &&
    file.size <= MAX_PPKS_PHOTO_FILE_BYTES &&
    detectPhotoFileFormat(file.name, file.type) !== null;
}

export function getPhotoUploadMimeType(file: Pick<File, 'name' | 'type'>): string {
  const mime = String(file.type || '').trim();
  if (mime && mime !== 'application/octet-stream') return mime;
  const ext = extensionOf(file.name);
  const mimeByExtension: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', jpe: 'image/jpeg',
    png: 'image/png', gif: 'image/gif', webp: 'image/webp',
    bmp: 'image/bmp', dib: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff',
    heic: 'image/heic', heif: 'image/heif', psd: 'image/vnd.adobe.photoshop',
    pdf: 'application/pdf', doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  if (RAW_EXTENSIONS.has(ext)) return 'application/octet-stream';
  return mimeByExtension[ext] || 'application/octet-stream';
}

const remoteScripts = new Map<string, Promise<void>>();
const remoteModules = new Map<string, Promise<Record<string, unknown>>>();

function loadScript(src: string): Promise<void> {
  const previous = remoteScripts.get(src);
  if (previous) return previous;
  const task = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-sipandu-src="' + src + '"]');
    if (existing?.dataset.loaded === 'true') { resolve(); return; }
    const script = existing || document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.sipanduSrc = src;
    script.onload = () => { script.dataset.loaded = 'true'; resolve(); };
    script.onerror = () => {
      remoteScripts.delete(src);
      reject(new Error('Pustaka pembaca format belum dapat dimuat. Periksa koneksi internet lalu coba lagi.'));
    };
    if (!existing) document.head.appendChild(script);
  });
  remoteScripts.set(src, task);
  return task;
}

async function loadModule(url: string): Promise<Record<string, unknown>> {
  const previous = remoteModules.get(url);
  if (previous) return previous;
  const task = import(/* @vite-ignore */ url) as Promise<Record<string, unknown>>;
  remoteModules.set(url, task);
  try { return await task; }
  catch (error) {
    remoteModules.delete(url);
    throw error;
  }
}

function canvasBlob(canvas: HTMLCanvasElement, type = 'image/png'): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Pratinjau gambar gagal dibuat.')), type);
  });
}

function dataUriBlob(dataUri: string): Blob | null {
  try {
    const comma = dataUri.indexOf(',');
    if (comma < 0) return null;
    const header = dataUri.slice(0, comma);
    const mime = header.match(/^data:([^;,]+)/i)?.[1] || 'image/png';
    const body = dataUri.slice(comma + 1);
    const bytes = /;base64/i.test(header)
      ? Uint8Array.from(atob(body), (char) => char.charCodeAt(0))
      : new TextEncoder().encode(decodeURIComponent(body));
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

function firstEmbeddedImage(html: string): Blob | null {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const images = Array.from(parsed.querySelectorAll('img[src]'));
  for (const image of images) {
    const src = image.getAttribute('src') || '';
    if (src.startsWith('data:image/')) {
      const blob = dataUriBlob(src);
      if (blob) return blob;
    }
  }
  return null;
}

function makeDocumentTextPreview(fileName: string, content: string): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 1280;
  const context = canvas.getContext('2d');
  if (!context) return Promise.reject(new Error('Browser tidak dapat membuat pratinjau dokumen.'));
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#183525';
  context.font = 'bold 30px Arial, sans-serif';
  context.fillText('SIPANDU • PRATINJAU DOKUMEN', 64, 90);
  context.fillStyle = '#64748b';
  context.font = '20px Arial, sans-serif';
  context.fillText(fileName.slice(0, 54), 64, 132);
  context.strokeStyle = '#d5e2d8';
  context.beginPath();
  context.moveTo(64, 160);
  context.lineTo(896, 160);
  context.stroke();
  context.fillStyle = '#1f2937';
  context.font = '22px Arial, sans-serif';
  const words = String(content || 'Dokumen berhasil dibaca, tetapi tidak ditemukan foto yang dapat ditampilkan.')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ');
  let line = '';
  let y = 215;
  for (const word of words) {
    const next = line ? line + ' ' + word : word;
    if (context.measureText(next).width > 820 && line) {
      context.fillText(line, 64, y);
      line = word;
      y += 34;
      if (y > 1170) break;
    } else line = next;
  }
  if (line && y <= 1170) context.fillText(line, 64, y);
  return canvasBlob(canvas, 'image/png');
}

async function convertTiff(buffer: ArrayBuffer): Promise<Blob> {
  const module = await loadModule('https://esm.sh/utif@3.1.0?bundle');
  const utif = (module.default || module) as Record<string, (...args: any[]) => any>;
  const ifds = utif.decode(new Uint8Array(buffer)) as Array<{ width: number; height: number }>;
  if (!ifds?.length) throw new Error('File TIFF tidak memiliki halaman gambar yang dapat dibaca.');
  utif.decodeImage(new Uint8Array(buffer), ifds[0]);
  const rgba = utif.toRGBA8(ifds[0]) as Uint8Array;
  const width = Number(ifds[0].width || 0);
  const height = Number(ifds[0].height || 0);
  if (!width || !height || !rgba?.length) throw new Error('Data piksel TIFF tidak dapat diuraikan.');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Browser tidak dapat membuat pratinjau TIFF.');
  context.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  return canvasBlob(canvas);
}

async function convertPsd(buffer: ArrayBuffer): Promise<Blob> {
  const module = await loadModule('https://esm.sh/ag-psd@31.0.3?bundle');
  const readPsd = module.readPsd as ((input: ArrayBuffer) => { canvas?: HTMLCanvasElement; children?: Array<{ canvas?: HTMLCanvasElement }> }) | undefined;
  if (!readPsd) throw new Error('Pembaca PSD tidak menyediakan fungsi pembacaan.');
  const psd = readPsd(buffer);
  const canvas = psd.canvas || psd.children?.find((layer) => layer.canvas)?.canvas;
  if (!canvas) throw new Error('PSD terbaca, tetapi tidak memiliki komposit gambar yang dapat ditampilkan.');
  const output = document.createElement('canvas');
  output.width = canvas.width;
  output.height = canvas.height;
  const context = output.getContext('2d');
  if (!context) throw new Error('Browser tidak dapat membuat pratinjau PSD.');
  context.drawImage(canvas, 0, 0);
  return canvasBlob(output);
}

async function convertHeic(blob: Blob): Promise<Blob> {
  await loadScript('https://cdn.jsdelivr.net/npm/heic-to@1.6.7/dist/iife/heic-to.js');
  const converter = (window as unknown as { HeicTo?: (options: Record<string, unknown>) => Promise<Blob> }).HeicTo;
  if (!converter) throw new Error('Pustaka HEIC/HEIF tidak berhasil diinisialisasi.');
  const converted = await converter({ blob, type: 'image/jpeg', quality: 0.9 });
  if (!(converted instanceof Blob) || !converted.size) throw new Error('File HEIC/HEIF tidak menghasilkan gambar pratinjau.');
  return converted;
}

async function convertRaw(buffer: ArrayBuffer): Promise<Blob> {
  try {
    const module = await loadModule('https://esm.sh/dcraw-wasm@0.0.4?bundle');
    const Decoder = module.RawDecoder as (new () => { extractThumbnail: (input: ArrayBuffer | Uint8Array) => Promise<Uint8Array | null> }) | undefined;
    if (!Decoder) throw new Error('Decoder RAW tidak tersedia.');
    const decoder = new Decoder();
    const thumbnail = await decoder.extractThumbnail(buffer);
    if (thumbnail?.length) return new Blob([thumbnail], { type: 'image/jpeg' });
  } catch (error) {
    throw new Error('Pratinjau RAW gagal dibuat: ' + (error instanceof Error ? error.message : String(error)));
  }
  throw new Error('File RAW tidak memiliki thumbnail JPEG tertanam yang dapat ditampilkan.');
}

async function renderPdfFirstPage(buffer: ArrayBuffer): Promise<Blob> {
  const version = '5.4.530';
  const module = await loadModule('https://cdn.jsdelivr.net/npm/pdfjs-dist@' + version + '/build/pdf.mjs');
  const pdfjs = (module.default || module) as {
    getDocument: (options: Record<string, unknown>) => { promise: Promise<any> };
    GlobalWorkerOptions: { workerSrc: string };
  };
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@' + version + '/build/pdf.worker.mjs';
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false }).promise;
  try {
    const page = await pdf.getPage(1);
    const initialViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(1.35, 1200 / Math.max(initialViewport.width, initialViewport.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Browser tidak dapat membuat pratinjau PDF.');
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    return await canvasBlob(canvas);
  } finally {
    await pdf.destroy();
  }
}

async function convertDocx(buffer: ArrayBuffer, fileName: string): Promise<Blob> {
  await loadScript('https://cdn.jsdelivr.net/npm/mammoth@1.10.0/mammoth.browser.min.js');
  const mammoth = (window as unknown as { mammoth?: {
    convertToHtml: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
    extractRawText: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
  } }).mammoth;
  if (!mammoth) throw new Error('Pembaca DOCX tidak berhasil dimuat.');
  try {
    const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
    const image = firstEmbeddedImage(result.value || '');
    if (image) return image;
    const parsed = new DOMParser().parseFromString(result.value || '', 'text/html');
    return makeDocumentTextPreview(fileName, parsed.body.textContent || '');
  } catch {
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    return makeDocumentTextPreview(fileName, result.value || '');
  }
}

async function convertDoc(buffer: ArrayBuffer, fileName: string): Promise<Blob> {
  const module = await loadModule('https://esm.sh/@file-viewer/doc@3.3.0?bundle');
  const parseMsDoc = module.parseMsDoc as ((input: ArrayBuffer) => unknown) | undefined;
  const renderMsDoc = module.renderMsDoc as ((parsed: unknown) => { html?: string }) | undefined;
  if (!parseMsDoc || !renderMsDoc) throw new Error('Pembaca dokumen DOC lama tidak tersedia.');
  const parsed = parseMsDoc(buffer);
  const rendered = renderMsDoc(parsed);
  const html = rendered.html || '';
  const image = firstEmbeddedImage(html);
  if (image) return image;
  const parsedHtml = new DOMParser().parseFromString(html, 'text/html');
  return makeDocumentTextPreview(fileName, parsedHtml.body.textContent || '');
}

/** Convert a photo/document into a browser-displayable image preview without uploading its contents to a conversion service. */
export async function createPhotoPreviewBlob(
  input: Blob,
  fileName = 'photo',
  mimeType = input.type,
): Promise<Blob> {
  if (!input.size) throw new Error('File kosong atau rusak.');
  if (input.size > MAX_PPKS_PHOTO_FILE_BYTES) {
    throw new Error('Ukuran berkas maksimal 30 MB agar tetap aman diproses pada perangkat.');
  }
  const buffer = await input.arrayBuffer();
  const format = detectPhotoFileFormat(fileName, mimeType, buffer);
  if (!format) throw new Error('Format berkas tidak dikenali. Gunakan JPG/JPEG, PNG, GIF, WEBP, BMP, TIFF/TIF, HEIC/HEIF, RAW, PSD, PDF, DOC, atau DOCX.');
  if (['jpeg', 'png', 'gif', 'webp', 'bmp'].includes(format)) {
    const outputType = format === 'jpeg' ? 'image/jpeg'
      : format === 'png' ? 'image/png'
      : format === 'gif' ? 'image/gif'
      : format === 'webp' ? 'image/webp' : 'image/bmp';
    return new Blob([input], { type: outputType });
  }
  if (format === 'tiff') return convertTiff(buffer);
  if (format === 'psd') return convertPsd(buffer);
  if (format === 'heic') return convertHeic(input);
  if (format === 'raw') return convertRaw(buffer);
  if (format === 'pdf') return renderPdfFirstPage(buffer);
  if (format === 'docx') return convertDocx(buffer, fileName);
  if (format === 'doc') return convertDoc(buffer, fileName);
  throw new Error('Format berkas belum memiliki pembaca pratinjau.');
}
