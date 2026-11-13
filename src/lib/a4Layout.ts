/** ISO 216 A4 page dimensions in PDF points (1 pt = 1/72 inch). */
export const A4_WIDTH_PT = (210 / 25.4) * 72;
export const A4_HEIGHT_PT = (297 / 25.4) * 72;
export const PAGE_MARGIN_PT = (8 / 25.4) * 72;

/**
 * Keep PDF rasterization at the CSS page width. A descendant's scrollWidth
 * must never widen the canvas: doing so scales the complete page down to fit
 * A4 and changes the official table's column proportions. Vertical overflow
 * is still included so wrapped answers are not silently cut off.
 */
export interface AssessmentPageMetrics {
  width: number;
  height: number;
  scrollHeight: number;
  scrollWidth?: number;
}

export interface AssessmentPageRenderDimensions {
  width: number;
  height: number;
}

export function getAssessmentPageRenderDimensions(
  metrics: AssessmentPageMetrics,
): AssessmentPageRenderDimensions {
  const { width, height, scrollHeight } = metrics;
  if (
    !Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(scrollHeight) ||
    width <= 0 || height <= 0 || scrollHeight < 0
  ) {
    throw new Error('Ukuran halaman asesmen tidak valid untuk dirender.');
  }

  return {
    width: Math.ceil(width),
    height: Math.ceil(Math.max(height, scrollHeight)),
  };
}

export interface A4Placement {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Fit an image inside A4 margins, preserving its ratio and centering it. */
export function fitImageToA4(imageWidth: number, imageHeight: number): A4Placement {
  if (
    !Number.isFinite(imageWidth) || !Number.isFinite(imageHeight) ||
    imageWidth <= 0 || imageHeight <= 0
  ) throw new Error('Ukuran gambar halaman PDF tidak valid.');

  const availableWidth = A4_WIDTH_PT - PAGE_MARGIN_PT * 2;
  const availableHeight = A4_HEIGHT_PT - PAGE_MARGIN_PT * 2;
  const scale = Math.min(availableWidth / imageWidth, availableHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    x: (A4_WIDTH_PT - width) / 2,
    y: A4_HEIGHT_PT - PAGE_MARGIN_PT - height,
    width,
    height,
  };
}


export interface AssessmentPageSlice {
  top: number;
  bottom: number;
}

/**
 * Split an over-height assessment sheet only at measured row/block boundaries.
 * This prevents the PDF renderer from shrinking a long form to fit one A4 page
 * or cutting a question row in half.
 */
export function splitAssessmentPageAtRows(
  totalHeightPx: number,
  maxSliceHeightPx: number,
  rowBottomsPx: number[],
): AssessmentPageSlice[] {
  if (
    !Number.isFinite(totalHeightPx) || !Number.isFinite(maxSliceHeightPx) ||
    totalHeightPx <= 0 || maxSliceHeightPx <= 0 ||
    !Array.isArray(rowBottomsPx) ||
    rowBottomsPx.some((value) => !Number.isFinite(value))
  ) {
    throw new Error('Ukuran pemisahan halaman asesmen tidak valid.');
  }

  const boundaries = [...new Set(rowBottomsPx
    .filter((value) => value > 0 && value < totalHeightPx)
    .map((value) => Math.round(value)))]
    .sort((a, b) => a - b);
  const slices: AssessmentPageSlice[] = [];
  let top = 0;

  while (top < totalHeightPx) {
    const remaining = totalHeightPx - top;
    if (remaining <= maxSliceHeightPx) {
      slices.push({ top, bottom: totalHeightPx });
      break;
    }

    const limit = top + maxSliceHeightPx;
    const safeBottom = boundaries.reduce<number | null>(
      (best, value) => value > top && value <= limit ? value : best,
      null,
    );
    if (safeBottom === null) {
      throw new Error(
        'Satu baris jawaban lebih tinggi daripada area satu halaman A4. Ringkas jawaban pada kolom tersebut sebelum mencetak.',
      );
    }

    slices.push({ top, bottom: safeBottom });
    top = safeBottom;
  }

  return slices;
}
