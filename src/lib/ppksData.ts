import { PPKSRecord } from '../types';

/**
 * Parses spreadsheet timestamps without trusting the browser's locale-dependent
 * Date.parse behavior for Indonesian dd/MM/yyyy values.
 * Google Sheets may show either dd/MM/yyyy or M/d/yyyy. When one component is
 * >12 the format is unambiguous; when both are <=12, Indonesia day-first is used.
 */
export function parsePPKSTimestamp(value: unknown): number | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  // ISO timestamps with a timezone represent an actual instant and are parsed as such.
  if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
    const epoch = Date.parse(raw);
    return Number.isFinite(epoch) ? epoch : null;
  }

  // ISO date/time without a zone is a spreadsheet wall-clock value.
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (iso) {
    const [, ys, ms, ds, hs = '0', mins = '0', ss = '0'] = iso;
    return createLocalDate(Number(ys), Number(ms), Number(ds), Number(hs), Number(mins), Number(ss));
  }

  // Common Google Forms/Sheets date formats, including "25/10/2026 14:03:09"
  // and "10/25/2026 2:03:09 PM".
  const dmy = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:[\s,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([AP]M))?)?$/i);
  if (dmy) {
    let [, first, second, yearText, hours = '0', minutes = '0', seconds = '0', meridiem = ''] = dmy;
    const a = Number(first);
    const b = Number(second);
    // M/d/yyyy when the second field cannot be a month; otherwise use D/M/yyyy.
    const monthFirst = b > 12 && a <= 12;
    const day = monthFirst ? b : a;
    const month = monthFirst ? a : b;
    let year = Number(yearText);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    let hour = Number(hours);
    if (meridiem) {
      if (meridiem.toUpperCase() === 'PM' && hour < 12) hour += 12;
      if (meridiem.toUpperCase() === 'AM' && hour === 12) hour = 0;
    }
    return createLocalDate(year, month, day, hour, Number(minutes), Number(seconds));
  }

  // Google Sheets serial date, only accept the plausible timestamp range.
  if (/^\d{5}(?:\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    if (serial >= 20000 && serial <= 80000) {
      const milliseconds = Math.round(serial * 86400000);
      // Convert the Sheets serial to a UTC wall-clock with no timezone shift.
      const date = new Date(Date.UTC(1899, 11, 30) + milliseconds);
      return createLocalDate(
        date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(),
        date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()
      );
    }
  }

  const fallback = Date.parse(raw);
  return Number.isFinite(fallback) ? fallback : null;
}

function createLocalDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number
): number | null {
  if (
    !Number.isInteger(year) || month < 1 || month > 12 || day < 1 || day > 31 ||
    hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59
  ) return null;
  const date = new Date(year, month - 1, day, hour, minute, second, 0);
  if (
    date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day ||
    date.getHours() !== hour || date.getMinutes() !== minute || date.getSeconds() !== second
  ) return null;
  return date.getTime();
}

/** Display a respondent's source timestamp in the requested dd/MM/yyyy HH:mm:ss format. */
export function formatPPKSTimestamp(value: unknown): string {
  const epoch = parsePPKSTimestamp(value);
  if (epoch === null) return String(value ?? '').trim() || 'Waktu tidak tersedia';
  const date = new Date(epoch);
  const pad = (number: number) => String(number).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** Newest respondent/submission first; records without a parseable time are kept last. */
export function sortPPKSRecordsByTimestamp<T extends Pick<PPKSRecord, 'timestamp' | 'namaLengkap'>>(
  records: T[]
): T[] {
  return [...records].sort((a, b) => {
    const aTime = parsePPKSTimestamp(a.timestamp);
    const bTime = parsePPKSTimestamp(b.timestamp);
    if (aTime === null && bTime === null) return 0;
    if (aTime === null) return 1;
    if (bTime === null) return -1;
    return bTime - aTime;
  });
}

/** Normalize administrative names from Form/Sheet values for robust district matching. */
export function normalizeNorthSumatraRegion(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('id-ID')
    .replace(/sumatera\s*utara|sumut|provinsi|province/g, '')
    .replace(/\b(kabupaten|kab\.?|kota|pemkab|pemko|administrasi)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}
