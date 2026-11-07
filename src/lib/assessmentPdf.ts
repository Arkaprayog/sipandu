import html2canvas from 'html2canvas';
import { PDFDocument } from 'pdf-lib';
import { sanitizeHtml2CanvasDocument } from './cssColorCompatibility';

const A4_WIDTH_PT = 595.276;
const A4_HEIGHT_PT = 841.89;
const PAGE_MARGIN_PT = (8 / 25.4) * 72;
const RENDER_SCALE = 2.5;

/**
 * Renders each official assessment sheet separately at high resolution and
 * assembles a true A4 PDF. Lossless PNG page images keep small text and lines crisp;
 * one-page-at-a-time rendering limits peak canvas memory on Android devices.
 */
export async function createOfficialAssessmentPdf(
  pages: HTMLElement[],
  renderRootId: string,
): Promise<Blob> {
  if (!Array.isArray(pages) || pages.length < 8) {
    throw new Error('Halaman Form Asesmen Terintegrasi tidak lengkap untuk dibuat menjadi PDF.');
  }

  const pdf = await PDFDocument.create();
  const contentWidth = A4_WIDTH_PT - PAGE_MARGIN_PT * 2;
  const contentHeight = A4_HEIGHT_PT - PAGE_MARGIN_PT * 2;

  for (let index = 0; index < pages.length; index += 1) {
    const element = pages[index];
    const bounds = element.getBoundingClientRect();
    const width = Math.ceil(Math.max(bounds.width, element.scrollWidth));
    const height = Math.ceil(Math.max(bounds.height, element.scrollHeight));
    if (width <= 0 || height <= 0) {
      throw new Error('Halaman ' + (index + 1) + ' kosong dan tidak dapat dimasukkan ke PDF.');
    }

    const canvas = await html2canvas(element, {
      backgroundColor: '#ffffff',
      scale: RENDER_SCALE,
      useCORS: true,
      allowTaint: false,
      logging: false,
      width,
      height,
      windowWidth: Math.max(window.innerWidth, width),
      windowHeight: Math.max(window.innerHeight, Math.ceil(bounds.bottom + 32)),
      scrollX: 0,
      scrollY: 0,
      onclone: (clonedDocument) => {
        // Tailwind CSS v4 emits oklch() colors, unsupported by html2canvas 1.x.
        // Normalize computed styles inside this PDF snapshot, not in the live UI.
        sanitizeHtml2CanvasDocument(clonedDocument);
        const root = clonedDocument.getElementById(renderRootId);
        if (root) {
          root.style.setProperty('opacity', '1', 'important');
          root.style.setProperty('visibility', 'visible', 'important');
        }
      },
    });

    try {
      if (canvas.width <= 0 || canvas.height <= 0) {
        throw new Error('Halaman ' + (index + 1) + ' gagal dirender.');
      }
      const pngBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Gambar halaman ' + (index + 1) + ' gagal dikompresi.'));
        }, 'image/png');
      });
      const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());
      const embeddedImage = await pdf.embedPng(pngBytes);
      const pdfPage = pdf.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
      const fit = Math.min(
        contentWidth / embeddedImage.width,
        contentHeight / embeddedImage.height,
      );
      const drawWidth = embeddedImage.width * fit;
      const drawHeight = embeddedImage.height * fit;
      pdfPage.drawImage(embeddedImage, {
        x: (A4_WIDTH_PT - drawWidth) / 2,
        y: A4_HEIGHT_PT - PAGE_MARGIN_PT - drawHeight,
        width: drawWidth,
        height: drawHeight,
      });
    } finally {
      // Release the large raster allocation before rendering the next page.
      canvas.width = 0;
      canvas.height = 0;
    }
  }

  const bytes = await pdf.save({ useObjectStreams: true });
  const output = new Uint8Array(bytes);
  return new Blob([output.buffer as ArrayBuffer], { type: 'application/pdf' });
}
