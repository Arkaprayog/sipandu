import { PPKSRecord } from '../types';
import { normalizePPKSPhotoSource } from './photoSources';

/** Guardrail: the verified source roster currently contains 44 real PPKS. Update only when the official roster changes. */
export const EXPECTED_REAL_PPKS_COUNT = 44;

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

/**
 * Match records belonging to the same person. A confirmed 16-digit NIK is
 * strongest; otherwise use the normalized full name while rejecting conflicting
 * NIKs or phone numbers. This intentionally does not delete cloud documents.
 */
type PPKSIdentityFields = Pick<PPKSRecord, 'id' | 'timestamp' | 'namaLengkap' | 'nik' | 'noHpWa'> &
  Pick<Partial<PPKSRecord>, 'officialAssessment'>;

function normalizePPKSNIK(value: unknown): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  return /^\d{16}$/.test(digits) ? digits : '';
}

/** All validated NIK candidates are checked; imported rows can contain both mapped NIK and official question 23. */
export function getPPKSNIKCandidates(record: PPKSIdentityFields): string[] {
  return [...new Set([
    normalizePPKSNIK(record.nik),
    normalizePPKSNIK(record.officialAssessment?.q23),
  ].filter(Boolean))];
}

export function getSharedPPKSNIK(a: PPKSIdentityFields, b: PPKSIdentityFields): string {
  const bNiks = new Set(getPPKSNIKCandidates(b));
  return getPPKSNIKCandidates(a).find((nik) => bNiks.has(nik)) || '';
}

export function samePPKSIdentity(
  a: PPKSIdentityFields,
  b: PPKSIdentityFields
): boolean {
  const normalizeText = (value: unknown) => String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('id-ID').replace(/[^a-z0-9]/g, '');
  const normalizePhone = (value: unknown) => String(value ?? '').replace(/\D/g, '');
  const aNiks = getPPKSNIKCandidates(a);
  const bNiks = getPPKSNIKCandidates(b);

  // A shared validated NIK wins even if a secondary mapped field conflicts.
  // The prior single-field preference could miss repeated Forms submissions
  // whenever the selected NIK column differed from the official Q23 answer.
  if (aNiks.some((nik) => bNiks.includes(nik))) return true;
  // Conflicting valid NIKs are not merged based only on name/phone.
  if (aNiks.length && bNiks.length) return false;

  const aName = normalizeText(a.namaLengkap);
  const bName = normalizeText(b.namaLengkap);
  if (!aName || !bName) return a.id === b.id;
  if (aName !== bName) return false;

  const aPhone = normalizePhone(a.noHpWa);
  const bPhone = normalizePhone(b.noHpWa);
  // When a phone is available on both rows it must agree. Otherwise require an
  // identical parsed submission timestamp; name alone is too ambiguous.
  if (aPhone && bPhone) return aPhone === bPhone;
  const aTimestamp = parsePPKSTimestamp(a.timestamp);
  const bTimestamp = parsePPKSTimestamp(b.timestamp);
  return aTimestamp !== null && bTimestamp !== null && aTimestamp === bTimestamp;
}

/** Collapse duplicate person rows while retaining the newest timestamp and any non-empty details. */
export function deduplicatePPKSRecords<T extends PPKSRecord>(records: T[]): T[] {
  const oldestFirst = [...records].sort((a, b) => {
    const aTime = parsePPKSTimestamp(a.timestamp);
    const bTime = parsePPKSTimestamp(b.timestamp);
    if (aTime === null && bTime === null) return 0;
    if (aTime === null) return -1;
    if (bTime === null) return 1;
    return aTime - bTime;
  });
  const unique: T[] = [];

  for (const next of oldestFirst) {
    const duplicateIndex = unique.findIndex((candidate) => samePPKSIdentity(candidate, next));
    if (duplicateIndex < 0) {
      unique.push(next);
      continue;
    }
    const previous = unique[duplicateIndex];
    const nonEmpty = (value: unknown) => Array.isArray(value) ? value.length > 0 : String(value ?? '').trim() !== '';
    const nextOfficial = Object.fromEntries(
      Object.entries(next.officialAssessment || {}).filter(([, value]) => nonEmpty(value))
    );
    const nextIntegrated = Object.fromEntries(
      Object.entries(next.integratedForm || {}).filter(([, value]) => nonEmpty(value))
    );
    unique[duplicateIndex] = {
      ...previous,
      ...next,
      nik: getSharedPPKSNIK(previous, next) ||
        normalizePPKSNIK(next.officialAssessment?.q23) ||
        next.nik ||
        normalizePPKSNIK(previous.officialAssessment?.q23) ||
        previous.nik,
      usia: next.usia || previous.usia,
      kotaDomisili: next.kotaDomisili || previous.kotaDomisili,
      alamatLengkap: next.alamatLengkap || previous.alamatLengkap,
      noHpWa: next.noHpWa || previous.noHpWa,
      jenisBantuan: next.jenisBantuan || previous.jenisBantuan,
      intervensiMental: next.intervensiMental || previous.intervensiMental,
      fotoDiri: normalizePPKSPhotoSource(next.fotoDiri) || normalizePPKSPhotoSource(previous.fotoDiri),
      fotoKtp: normalizePPKSPhotoSource(next.fotoKtp) || normalizePPKSPhotoSource(previous.fotoKtp),
      fotoKk: normalizePPKSPhotoSource(next.fotoKk) || normalizePPKSPhotoSource(previous.fotoKk),
      fotoRumah: normalizePPKSPhotoSource(next.fotoRumah) || normalizePPKSPhotoSource(previous.fotoRumah),
      integratedForm: Object.keys(nextIntegrated).length
        ? ({ ...(previous.integratedForm || {}), ...nextIntegrated } as T['integratedForm'])
        : previous.integratedForm,
      officialAssessment: Object.keys(nextOfficial).length
        ? ({
            ...(previous.officialAssessment || {}),
            ...nextOfficial,
            ...(getSharedPPKSNIK(previous, next)
              ? { q23: getSharedPPKSNIK(previous, next) }
              : {}),
          } as T['officialAssessment'])
        : (getSharedPPKSNIK(previous, next)
          ? ({ ...(previous.officialAssessment || {}), q23: getSharedPPKSNIK(previous, next) } as T['officialAssessment'])
          : previous.officialAssessment),
      statusAsesmen: next.officialAssessment || next.integratedForm
        ? 'Terintegrasi'
        : (previous.statusAsesmen || next.statusAsesmen),
    } as T;
  }
  return unique;
}

/** Sort the master respondent list alphabetically by full name (Indonesian locale). */
export function sortPPKSRecordsByName<T extends Pick<PPKSRecord, 'namaLengkap'>>(records: T[]): T[] {
  return [...records].sort((a, b) =>
    String(a.namaLengkap || '').localeCompare(String(b.namaLengkap || ''), 'id-ID', {
      sensitivity: 'base',
      numeric: true,
    })
  );
}

/** Display the timestamp exactly as received from Google Sheets/Forms to avoid changing its visible format. */
export function formatPPKSTimestamp(value: unknown): string {
  // Imported spreadsheet values are already formatted by Google Sheets. Keep that
  // exact string instead of converting US/day-first formats or shifting wall time.
  return String(value ?? '').trim() || 'Waktu tidak tersedia';
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
