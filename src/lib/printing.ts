import { Capacitor } from '@capacitor/core';
import { Printer } from '@capgo/capacitor-printer';

/** Uses native Android/iOS print UI and the browser print dialog for PWA. */
export async function printCurrentWebView(name: string): Promise<void> {
  await Printer.printWebView({ name });
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

/** Prints a small PDF or image without relying on an anchor download in WebView. */
export async function printSupportedBlob(
  blob: Blob,
  name: string,
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png',
): Promise<void> {
  if (blob.size <= 0) throw new Error('File kosong dan tidak dapat dicetak.');
  await Printer.printBase64({ name, data: await blobToBase64(blob), mimeType });
}



export type AssessmentPdfSaveResult =
  | { destination: 'app-private-storage'; uri: string }
  | { destination: 'browser-download'; uri?: never };

/**
 * Save assessment PDFs in private Android app storage. These documents can
 * contain identity and case data, so they are deliberately not written to
 * the public Downloads folder. The web app keeps its normal browser download.
 */
export async function savePdfToDevice(blob: Blob, name: string): Promise<AssessmentPdfSaveResult> {
  if (blob.size <= 0) throw new Error('File PDF kosong dan tidak dapat disimpan.');
  if ((await blob.slice(0, 5).text()) !== '%PDF-') {
    throw new Error('Berkas yang akan disimpan bukan PDF yang valid.');
  }

  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    const nativePrinter = Printer as typeof Printer & {
      savePdfToAppStorage(options: {
        name: string;
        data: string;
        mimeType: 'application/pdf';
      }): Promise<{ uri: string; name?: string }>;
    };
    const saved = await nativePrinter.savePdfToAppStorage({
      name,
      data: await blobToBase64(blob),
      mimeType: 'application/pdf',
    });
    if (!saved?.uri) {
      throw new Error('Android tidak mengembalikan lokasi file PDF yang tersimpan.');
    }
    return { destination: 'app-private-storage', uri: saved.uri };
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return { destination: 'browser-download' };
}

/** Print the verified PDF file already persisted in SIPANDU's private storage. */
export async function printPdfFromDevice(uri: string, name: string): Promise<void> {
  if (!uri.trim()) throw new Error('Lokasi PDF tersimpan tidak tersedia.');
  await Printer.printFile({ path: uri, name, mimeType: 'application/pdf' });
}

export async function printPdfBlob(blob: Blob, name: string): Promise<void> {
  return printSupportedBlob(blob, name, 'application/pdf');
}


/**
 * Print the prepared A4 assessment DOM directly. This avoids a base64-size
 * restriction and preserves the A4 layout in the native/browser print dialog.
 */
export async function printPreparedAssessmentWebView(name: string, rootId: string): Promise<void> {
  const root = document.getElementById(rootId);
  if (!(root instanceof HTMLElement)) {
    throw new Error('Area dokumen A4 untuk pencetakan tidak lagi tersedia. Buat PDF kembali.');
  }

  const previousRootStyle = root.getAttribute('style');
  const hiddenChildren = Array.from(document.body.children)
    .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== root)
    .map((element) => ({ element, style: element.getAttribute('style') }));
  const printStyle = document.createElement('style');
  printStyle.textContent =
    '@media print {' +
    '@page { size: A4 portrait; margin: 8mm; }' +
    'html, body { width: 210mm !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; background: #fff !important; }' +
    '#' + rootId + ' { display: block !important; position: static !important; left: auto !important; top: auto !important; opacity: 1 !important; visibility: visible !important; width: 194mm !important; max-width: 194mm !important; overflow: visible !important; }' +
    '#' + rootId + ', #' + rootId + ' * { visibility: visible !important; }' +
    '}';

  try {
    document.head.appendChild(printStyle);
    hiddenChildren.forEach(({ element }) => element.style.setProperty('display', 'none', 'important'));
    root.style.setProperty('position', 'static', 'important');
    root.style.setProperty('left', 'auto', 'important');
    root.style.setProperty('top', 'auto', 'important');
    root.style.setProperty('opacity', '1', 'important');
    root.style.setProperty('visibility', 'visible', 'important');
    root.style.setProperty('pointer-events', 'auto', 'important');
    root.style.setProperty('z-index', 'auto', 'important');
    root.style.setProperty('overflow', 'visible', 'important');
    root.style.setProperty('background', '#fff', 'important');
    await new Promise<void>((resolve) => requestAnimationFrame(() =>
      requestAnimationFrame(() => resolve())
    ));
    await Printer.printWebView({ name });
  } finally {
    if (previousRootStyle === null) root.removeAttribute('style');
    else root.setAttribute('style', previousRootStyle);
    hiddenChildren.forEach(({ element, style }) => {
      if (style === null) element.removeAttribute('style');
      else element.setAttribute('style', style);
    });
    printStyle.remove();
  }
}
