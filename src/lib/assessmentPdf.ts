import html2canvas from 'html2canvas';
import { PDFDocument } from 'pdf-lib';
import { A4_HEIGHT_PT, A4_WIDTH_PT, fitImageToA4, getAssessmentPageRenderDimensions, splitAssessmentPageAtRows } from './a4Layout';
import { splitOfficialAssessmentPageSections } from './assessmentPagePlan';
export const PDF_RENDER_SCALES = [2.5, 2, 1.5, 1] as const;
const JPEG_QUALITY = 0.94;

/**
 * html2canvas 1.4.x cannot parse modern CSS Color 4 values such as oklch().
 * Chrome can rasterize these colors, so use a 1x1 canvas to convert them to
 * sRGB before html2canvas reads computed styles from its cloned document.
 */
function replaceOklchWithRgba(value: string, context: CanvasRenderingContext2D): string {
  return value.replace(/oklch\([^)]*\)/gi, (color) => {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = '#000000';
    try {
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const pixel = context.getImageData(0, 0, 1, 1).data;
      const alpha = Number((pixel[3] / 255).toFixed(3));
      return `rgba(${pixel[0]}, ${pixel[1]}, ${pixel[2]}, ${alpha})`;
    } catch {
      // Keep PDF creation available even on browsers whose canvas cannot
      // rasterize this color syntax; the neutral fallback is printer-safe.
      return 'rgba(0, 0, 0, 1)';
    }
  });
}

function sanitizeOklchColorsForHtml2Canvas(
  clonedDocument: Document,
  renderRootId: string,
): void {
  const renderRoot = clonedDocument.getElementById(renderRootId);
  const view = clonedDocument.defaultView;
  const canvas = clonedDocument.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!renderRoot || !view || !context) return;

  const elements: Element[] = [
    clonedDocument.documentElement,
    clonedDocument.body,
    renderRoot,
    ...Array.from(renderRoot.querySelectorAll('*')),
  ].filter((element, index, all) => all.indexOf(element) === index);

  elements.forEach((element) => {
    const computed = view.getComputedStyle(element);
    for (let index = 0; index < computed.length; index += 1) {
      const property = computed.item(index);
      const value = computed.getPropertyValue(property);
      if (!/oklch\(/i.test(value)) continue;
      const compatibleValue = replaceOklchWithRgba(value, context);
      if (compatibleValue !== value) {
        (element as HTMLElement).style.setProperty(property, compatibleValue, 'important');
      }
    }
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: 'image/jpeg' | 'image/png',
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob && blob.size > 0 && blob.type === mimeType) resolve(blob);
        else reject(new Error('Halaman PDF gagal dikompresi sebagai ' + mimeType + '.'));
      }, mimeType, mimeType === 'image/jpeg' ? JPEG_QUALITY : undefined);
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

type EncodedAssessmentPage = { bytes: Uint8Array; format: 'jpg' | 'png' };

async function renderAssessmentPage(
  element: HTMLElement,
  renderRootId: string,
  pageNumber: number,
): Promise<EncodedAssessmentPage[]> {
  let lastError: unknown = null;
  const bounds = element.getBoundingClientRect();
  // Keep the canvas at the fixed A4 content width. A child with a long
  // unwrapped label must not widen the canvas and shrink every column.
  const { width, height } = getAssessmentPageRenderDimensions({
    width: bounds.width,
    height: bounds.height,
    scrollHeight: element.scrollHeight,
    scrollWidth: element.scrollWidth,
  });
  if (width <= 0 || height <= 0) {
    throw new Error('Halaman ' + pageNumber + ' kosong dan tidak dapat dimasukkan ke PDF.');
  }

  for (const scale of PDF_RENDER_SCALES) {
    let canvas: HTMLCanvasElement | null = null;
    try {
      canvas = await html2canvas(element, {
        backgroundColor: '#ffffff',
        scale,
        useCORS: true,
        allowTaint: false,
        logging: false,
        width,
        height,
        windowWidth: Math.max(window.innerWidth, width),
        windowHeight: Math.max(window.innerHeight, Math.ceil(bounds.top + height + 32)),
        scrollX: 0,
        scrollY: 0,
        onclone: (clonedDocument) => {
          sanitizeOklchColorsForHtml2Canvas(clonedDocument, renderRootId);
          const root = clonedDocument.getElementById(renderRootId);
          if (root) {
            root.style.setProperty('opacity', '1', 'important');
            root.style.setProperty('visibility', 'visible', 'important');
          }
        },
      });
      if (canvas.width <= 0 || canvas.height <= 0) {
        throw new Error('Kanvas halaman kosong.');
      }

      const renderScale = canvas.width / width;
      const targetPageHeight = Math.ceil(width * (281 / 194) * renderScale);
      const pageBounds = element.getBoundingClientRect();
      const rowBottoms = [
        ...Array.from(element.querySelectorAll('tr')).map((row) =>
          (row.getBoundingClientRect().bottom - pageBounds.top) * renderScale
        ),
        ...Array.from(element.querySelectorAll('.official-footer-note, .official-signature')).map((block) =>
          (block.getBoundingClientRect().bottom - pageBounds.top) * renderScale
        ),
      ].filter((value) => Number.isFinite(value) && value > 0);
      const slices = splitAssessmentPageAtRows(canvas.height, targetPageHeight, rowBottoms);
      const encodedPages: EncodedAssessmentPage[] = [];

      for (const slice of slices) {
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = targetPageHeight;
        try {
          const pageContext = pageCanvas.getContext('2d');
          if (!pageContext) throw new Error('Kanvas halaman PDF tidak dapat dibuat.');
          pageContext.fillStyle = '#ffffff';
          pageContext.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
          pageContext.drawImage(
            canvas,
            0, slice.top, canvas.width, slice.bottom - slice.top,
            0, 0, canvas.width, slice.bottom - slice.top,
          );

          try {
            const jpeg = await canvasToBlob(pageCanvas, 'image/jpeg');
            encodedPages.push({ bytes: new Uint8Array(await jpeg.arrayBuffer()), format: 'jpg' });
          } catch (jpegError) {
            // JPEG encoding can fail on particular mobile browsers. Keep a lossless
            // PNG fallback for that page before retrying the whole render at lower DPI.
            if (jpegError instanceof DOMException && jpegError.name === 'SecurityError') throw jpegError;
            const png = await canvasToBlob(pageCanvas, 'image/png');
            encodedPages.push({ bytes: new Uint8Array(await png.arrayBuffer()), format: 'png' });
          }
        } finally {
          pageCanvas.width = 0;
          pageCanvas.height = 0;
        }
      }

      return encodedPages;
    } catch (error) {
      lastError = error;
    } finally {
      if (canvas) {
        // Release the large raster allocation before the next page or DPI attempt.
        canvas.width = 0;
        canvas.height = 0;
      }
    }
  }

  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    'Halaman ' + pageNumber + ' gagal dirender menjadi PDF A4 pada beberapa tingkat resolusi: ' + reason,
  );
}

/**
 * Renders the six original assessment pages followed by four photo appendices as A4 pages.
 * Over-height answer sheets are split at measured table-row boundaries so long answers
 * wrap inside their columns without shrinking the entire page or cutting a row in half.
 * Rendering retries at lower resolution on memory-constrained mobile devices.
 */
export async function createOfficialAssessmentPdf(
  pages: HTMLElement[],
  renderRootId: string,
): Promise<Blob> {
  const { formPages, photoPages } = splitOfficialAssessmentPageSections(pages);

  const pdf = await PDFDocument.create();
  let nextPdfPageNumber = 1;

  const appendRenderedPages = async (element: HTMLElement, pageNumber: number): Promise<number> => {
    const encodedPages = await renderAssessmentPage(element, renderRootId, pageNumber);
    for (const encoded of encodedPages) {
      const embeddedImage = encoded.format === 'jpg'
        ? await pdf.embedJpg(encoded.bytes)
        : await pdf.embedPng(encoded.bytes);
      const pdfPage = pdf.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
      pdfPage.drawImage(embeddedImage, fitImageToA4(embeddedImage.width, embeddedImage.height));
    }
    return encodedPages.length;
  };

  // Render the six original form sheets first. Long answers can add continuation
  // sheets; the four photo appendices are placed after all form content.
  for (const page of formPages) {
    nextPdfPageNumber += await appendRenderedPages(page, nextPdfPageNumber);
  }

  const formPageCount = nextPdfPageNumber - 1;
  const totalPageCount = formPageCount + photoPages.length;
  for (let index = 0; index < photoPages.length; index += 1) {
    const heading = photoPages[index].querySelector('.official-photo-appendix-heading p');
    if (heading) {
      heading.textContent = 'Form Asesmen Terintegrasi · Halaman '
        + (formPageCount + index + 1) + ' dari ' + totalPageCount;
    }
  }

  for (let index = 0; index < photoPages.length; index += 1) {
    nextPdfPageNumber += await appendRenderedPages(photoPages[index], nextPdfPageNumber);
  }

  const bytes = await pdf.save({ useObjectStreams: true });
  const output = new Uint8Array(bytes);
  const result = new Blob([output.buffer as ArrayBuffer], { type: 'application/pdf' });
  if (result.size < 8 || (await result.slice(0, 5).text()) !== '%PDF-') {
    throw new Error('PDF A4 tidak valid setelah dirender.');
  }
  return result;
}
