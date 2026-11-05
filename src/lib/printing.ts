import { Printer } from '@capgo/capacitor-printer';

const MAX_BASE64_PRINT_BYTES = 5 * 1024 * 1024;

/** Uses native Android/iOS print UI and the browser print dialog for PWA. */
export async function printCurrentWebView(name: string): Promise<void> {
  await Printer.printWebView({ name });
}

/** Prints a small generated PDF without relying on an anchor download in WebView. */
export async function printPdfBlob(blob: Blob, name: string): Promise<void> {
  if (blob.size <= 0) throw new Error('PDF kosong dan tidak dapat dicetak.');
  if (blob.size > MAX_BASE64_PRINT_BYTES) {
    throw new Error('PDF lebih dari 5 MB. Buka/unduh file terlebih dahulu lalu cetak dari penampil PDF perangkat agar memori aplikasi tetap aman.');
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  await Printer.printBase64({
    name,
    data: btoa(binary),
    mimeType: 'application/pdf',
  });
}
