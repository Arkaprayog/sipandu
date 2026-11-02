/**
 * Zero-based columns for the verified ATENSI Google Form response tab
 * "From Responses 1". Keep this mapping in one place and cover it with tests.
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
  noHpWa: 13,          // N
  jenisBantuan: 39,    // AN
  intervensiMental: 40,// AO
  desil: 41,           // AP
} as const;

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
