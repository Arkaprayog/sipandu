import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { A4_HEIGHT_PT, A4_WIDTH_PT, PAGE_MARGIN_PT, fitImageToA4, getAssessmentPageRenderDimensions, splitAssessmentPageAtRows } from './a4Layout';


test('assessment capture width remains fixed when long text overflows a table cell', () => {
  const pageWidth = (194 / 25.4) * 96;
  const pageHeight = (281 / 25.4) * 96;
  const dimensions = getAssessmentPageRenderDimensions({
    width: pageWidth,
    height: pageHeight,
    scrollHeight: pageHeight + 48,
    scrollWidth: pageWidth + 180,
  });

  assert.equal(dimensions.width, Math.ceil(pageWidth));
  assert.equal(dimensions.height, Math.ceil(pageHeight + 48));
});
 
test('A4 dimensions match ISO 216 210 x 297 mm in PDF points', () => {
  assert.ok(Math.abs(A4_WIDTH_PT - (210 / 25.4) * 72) < 0.001);
  assert.ok(Math.abs(A4_HEIGHT_PT - (297 / 25.4) * 72) < 0.001);
});

test('A4 placement respects margins and keeps each page image ratio', () => {
  for (const [width, height] of [[194, 281], [10, 5000], [5000, 10], [1833, 2655]] as const) {
    const position = fitImageToA4(width, height);
    assert.ok(position.x >= PAGE_MARGIN_PT - 0.001);
    assert.ok(position.y >= PAGE_MARGIN_PT - 0.001);
    assert.ok(position.x + position.width <= A4_WIDTH_PT - PAGE_MARGIN_PT + 0.001);
    assert.ok(position.y + position.height <= A4_HEIGHT_PT - PAGE_MARGIN_PT + 0.001);
    assert.ok(Math.abs(position.width / position.height - width / height) < 1e-9);
  }
  assert.throws(() => fitImageToA4(0, 10), /Ukuran gambar/);
});

test('PDFDocument preserves twelve pages at exact A4 size', async () => {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < 12; index += 1) {
    const page = pdf.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
    page.drawRectangle({ x: PAGE_MARGIN_PT, y: PAGE_MARGIN_PT, width: 10, height: 10 });
  }
  const bytes = await pdf.save({ useObjectStreams: true });
  const reopened = await PDFDocument.load(bytes);
  assert.equal(reopened.getPageCount(), 12);
  for (const page of reopened.getPages()) {
    const size = page.getSize();
    assert.ok(Math.abs(size.width - A4_WIDTH_PT) < 0.001);
    assert.ok(Math.abs(size.height - A4_HEIGHT_PT) < 0.001);
  }
});


test('assessment pages split at row boundaries without cutting rows', () => {
  assert.deepEqual(
    splitAssessmentPageAtRows(2300, 1000, [450, 950, 1250, 1900]),
    [
      { top: 0, bottom: 950 },
      { top: 950, bottom: 1900 },
      { top: 1900, bottom: 2300 },
    ],
  );
});

test('assessment page remains one page when its content fits', () => {
  assert.deepEqual(
    splitAssessmentPageAtRows(800, 1000, []),
    [{ top: 0, bottom: 800 }],
  );
});

test('assessment pagination refuses to cut through an oversized question row', () => {
  assert.throws(
    () => splitAssessmentPageAtRows(2200, 1000, [1500]),
    /Satu baris jawaban lebih tinggi/,
  );
});
