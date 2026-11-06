import { Printer } from '@capgo/capacitor-printer';

const MAX_BASE64_PRINT_BYTES = 5 * 1024 * 1024;

/** Uses native Android/iOS print UI and the browser print dialog for PWA. */
export async function printCurrentWebView(name: string): Promise<void> {
  await Printer.printWebView({ name });
}

/** Prints a small PDF or image without relying on an anchor download in WebView. */
export async function printSupportedBlob(
  blob: Blob,
  name: string,
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png',
): Promise<void> {
  if (blob.size <= 0) throw new Error('File kosong dan tidak dapat dicetak.');
  if (blob.size > MAX_BASE64_PRINT_BYTES) {
    throw new Error('File lebih dari 5 MB. Buka/unduh file terlebih dahulu lalu cetak dari penampil perangkat agar memori aplikasi tetap aman.');
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  await Printer.printBase64({ name, data: btoa(binary), mimeType });
}

export async function printPdfBlob(blob: Blob, name: string): Promise<void> {
  return printSupportedBlob(blob, name, 'application/pdf');
}


/**
 * Print the prepared A4 assessment DOM when a PDF exceeds the safe base64
 * bridge size. The device/browser print dialog can save these pages as PDF
 * without encoding and decoding the entire document in memory.
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
