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
