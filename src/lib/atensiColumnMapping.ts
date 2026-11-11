/**
 * Zero-based columns for the verified ATENSI Google Form response tab
 * "Form Responses 1" (also accepts the historical app alias "From Responses 1"). Keep this mapping in one place and cover it with tests.
 */
export const ATENSI_PROFILE_COLUMN_INDEX = {
  timestamp: 0,       // A
  namaLengkap: 2,      // C
  nik: 3,              // D
  fotoDiri: 4,         // E
  fotoKtp: 5,          // F
  fotoKk: 6,           // G
  fotoRumah: 7,        // H
  kotaDomisili: 8,     // I
  alamatLengkap: 10,   // K
  usia: 11,            // L
  jenisKelamin: 12,   // M
  noHpWa: 13,          // N
  jenisBantuan: 38,    // AM
  lamaTerapiArv: 40,   // AO
  intervensiMental: 41,// AP
  desil: 42,           // AQ
} as const;

export const ATENSI_PROFILE_RESPONSE_TAB_NAME = 'Form Responses 1';
export const ATENSI_ASSESSMENT_RESPONSE_TAB_NAME = 'From Asesmen 1';

/**
 * Google Forms creates the response tab as "Form Responses 1".
 * Older SIPANDU builds used the misspelled alias "From Responses 1".
 * Accept both exact normalized names, but never a location/region tab.
 */
export function isAtensiProfileResponseTab(title: unknown): boolean {
  const normalized = String(title ?? '')
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .toLocaleLowerCase('id-ID')
    .replace(/[^a-z0-9]/g, '');
  return normalized === 'formresponses1' || normalized === 'fromresponses1';
}

export type AtensiProfileColumn = keyof typeof ATENSI_PROFILE_COLUMN_INDEX;

export function readAtensiProfileCell(
  row: readonly unknown[],
  field: AtensiProfileColumn,
): string {
  return String(row[ATENSI_PROFILE_COLUMN_INDEX[field]] ?? '').trim();
}

export const ATENSI_PHOTO_COLUMN_INDICES = [
  ATENSI_PROFILE_COLUMN_INDEX.fotoDiri,
  ATENSI_PROFILE_COLUMN_INDEX.fotoKtp,
  ATENSI_PROFILE_COLUMN_INDEX.fotoKk,
  ATENSI_PROFILE_COLUMN_INDEX.fotoRumah,
] as const;


/** Reads gender from its dedicated header first, then from an embedded age cell such as "18 Tahun (Laki-laki)". */
export function readAtensiGender(
  row: readonly unknown[],
  explicitGender = '',
): 'Laki-laki' | 'Perempuan' | '' {
  const ageCell = readAtensiProfileCell(row, 'usia');
  const embeddedGender = ageCell.match(/\(([^)]+)\)/)?.[1] || '';
  const candidates = [String(explicitGender || '').trim(), embeddedGender, ageCell];
  for (const candidate of candidates) {
    if (/perempuan|wanita|female/i.test(candidate)) return 'Perempuan';
    if (/laki[\s-]*laki|pria|male/i.test(candidate)) return 'Laki-laki';
  }
  return '';
}


/** Normalize a Google Forms column label for safe semantic matching. */
function normalizeAtensiHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('id-ID')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Resolve the current-residence address. Column K is the agreed fallback,
 * but a column explicitly labelled as KTP/address-on-identity-card is never
 * allowed to populate the current-domicile profile field.
 */
export function findAtensiCurrentDomicileAddressColumn(headers: readonly unknown[]): number {
  const normalized = headers.map(normalizeAtensiHeader);
  const isKTPAddress = (header: string) =>
    /ktp|kartutandapenduduk|identitaspenduduk|sesuaiktp/.test(header);
  const isCurrentAddress = (header: string) =>
    header.includes('alamat') &&
    !isKTPAddress(header) &&
    /(domisili|tempattinggal|alamatsekarang|tempattinggalsekarang|domisilisekarang)/.test(header);

  if (isCurrentAddress(normalized[ATENSI_PROFILE_COLUMN_INDEX.alamatLengkap])) {
    return ATENSI_PROFILE_COLUMN_INDEX.alamatLengkap;
  }

  const semanticMatches = normalized
    .map((header, index) => ({ header, index }))
    .filter(({ header }) => isCurrentAddress(header));

  if (semanticMatches.length === 1) return semanticMatches[0].index;
  if (semanticMatches.length > 1) {
    const columnK = semanticMatches.find(({ index }) => index === ATENSI_PROFILE_COLUMN_INDEX.alamatLengkap);
    return columnK?.index ?? -1;
  }

  // Do not reuse the KTP address just because it currently occupies column K.
  const fallbackHeader = normalized[ATENSI_PROFILE_COLUMN_INDEX.alamatLengkap] || '';
  return isKTPAddress(fallbackHeader) ? -1 : ATENSI_PROFILE_COLUMN_INDEX.alamatLengkap;
}

export function readAtensiCurrentDomicileAddress(
  headers: readonly unknown[],
  row: readonly unknown[],
): string {
  const index = findAtensiCurrentDomicileAddressColumn(headers);
  return index >= 0 ? String(row[index] ?? '').trim() : '';
}

/** Lama terapi ARV is owned by the separate "From Asesmen 1" response tab, column AO. */
export function readAtensiAssessmentArvDuration(row: readonly unknown[]): string {
  return readAtensiProfileCell(row, 'lamaTerapiArv');
}
