/**
 * Read the intervention/recommendation entered in the source response sheet.
 * Column BE is the agreed source of truth (zero-based index 56). If that cell is
 * blank, use a header-based fallback so the mapping still works if the column
 * is moved in a future revision of the sheet. This helper only reads values.
 */
export const INTERVENTION_RECOMMENDATION_COLUMN_INDEX = 56;

function normalizeHeader(value: string): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .replace(/^\\s*(?:q(?:uestion)?\\s*)?\\d{1,3}[\\s.)\\-:]+/i, '')
    .replace(/[^a-z0-9]/g, '');
}

export function readInterventionRecommendationFromRow(
  headers: readonly string[],
  row: readonly string[],
): string {
  const fromColumnBE = String(row[INTERVENTION_RECOMMENDATION_COLUMN_INDEX] ?? '').trim();
  if (fromColumnBE) return fromColumnBE;

  // If BE is blank, find the semantically matching column by its heading.
  const candidateIndices = headers
    .map((header, index) => ({ index, normalized: normalizeHeader(String(header ?? '')) }))
    .filter(({ normalized }) =>
      normalized.includes('intervensi') &&
      (normalized.includes('rekomendasi') || normalized.includes('tindaklanjut'))
    )
    .map(({ index }) => index);

  for (const index of candidateIndices) {
    const value = String(row[index] ?? '').trim();
    if (value) return value;
  }

  return '';
}
