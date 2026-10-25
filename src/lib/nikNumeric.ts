/**
 * Recover a NIK stored as a Google Sheets numeric cell only when its value is
 * exactly representable as a JavaScript safe integer. NIK remains a string.
 */
export function normalizeExactNumericNIK(value: unknown): string {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) return '';
  const digits = String(value);
  return /^\d{16}$/.test(digits) ? digits : '';
}
