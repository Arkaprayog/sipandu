/**
 * NIK mapping helpers isolated from Firebase/browser code so the mapping rules
 * can be regression-tested without a Google login session.
 */

function normalizeHeader(value: string): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** True only for respondent identity-number headers, not document uploads or relatives. */
export function isLikelyRespondentNIKHeader(header: string): boolean {
  const normalized = normalizeHeader(header);
  if (!normalized) return false;

  const nonIdentityDocument = [
    'foto', 'photo', 'gambar', 'image', 'upload', 'unggah', 'dokumen',
    'lampiran', 'scan', 'file', 'tautan', 'link', 'drive', 'berkas',
  ];
  if (nonIdentityDocument.some((word) => normalized.includes(word))) return false;

  const otherPerson = [
    'ayah', 'ibu', 'orangtua', 'bapak', 'mama', 'papa', 'wali', 'anak',
    'suami', 'istri', 'pasangan', 'keluarga', 'pendamping', 'petugas',
    'asesor', 'asessor', 'supervisor', 'kontakdarurat', 'penanggungjawab',
  ];
  if (
    otherPerson.some((word) => normalized.includes(word)) &&
    /(nik|ktp|kependudukan|identitas)/.test(normalized)
  ) return false;

  const identityTokens = [
    'nik', 'nomornik', 'nonik', 'nikresponden', 'nikppks', 'nomornikresponden', 'noidentitasnik', 'nomorindukkependudukanppks', 'nomoridentitasresponden', 'nomorindukkependudukanppks', 'nomorindukkependudukanresponden', 'nomorindukkependudukancalonresponden', 'nomorindukkependudukansesuaiktp', 'nomorindukkependudukansesuaikartutandapenduduk', 'niksesuaikartutandapenduduk', 'nomoridentitassesuaiktp', 'nomoridentitaspenduduk', 'nomorindukkependudukandiri', 'nikcalonresponden', 'nomoridentitasppks', 'niksesuaikartuidentitasresponden',
    'nomorindukkependudukan', 'noindukkependudukan', 'indukkependudukan',
    'noinduk', 'nokependudukan', 'nomorkependudukan',
    'nomorktp', 'noktp', 'ktpnik', 'nikktp', 'nomornikktp', 'nomorindukktp', 'noindukktp', 'nomorindukkependudukanktp', 'niksesuaiktp', 'nomorindukkependudukanrespondenppks',
    'kartutandapenduduk', 'ektp', 'kependudukan',
    'nomoridentitas', 'noidentitas', 'identitasresponden', 'nomorindukpenduduk', 'noindukkependudukanresponden', 'niksesuaikartuidentitas', 'niksesuaiktpresponden',
    'niksesuaiktp', 'nomorindukkependudukanresponden',
    'nationalid', 'nationalidentitynumber', 'identitynumber',
  ];
  return identityTokens.some((token) => normalized.includes(token)) ||
    normalized === 'ktp';
}

/**
 * Returns only an unambiguous 16-digit NIK. If a numeric cell has been
 * converted to scientific notation, do not guess the missing/rounded digits.
 */
export function normalizeNIKCellValue(value: unknown): string {
  const raw = String(value ?? '').trim().replace(/^['`]/, '').replace(/\.0+$/, '');
  if (!raw) return '';
  if (/^[+-]?\d+(?:[.,]\d+)?e[+-]?\d+$/i.test(raw)) return '';

  const digits = raw.replace(/\D/g, '');
  if (/^\d{16}$/.test(digits)) return digits;

  const sequences = [...raw.matchAll(/\d{16}/g)].map((match) => match[0]);
  return sequences.length === 1 ? sequences[0] : '';
}

/**
 * Converts a raw Google Sheets numeric cell into a NIK only when precision is
 * guaranteed. Unsafe numeric values must remain blank rather than be guessed.
 */
export function normalizeExactNumericNIK(value: unknown): string {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) return '';
  const digits = String(value);
  return /^\d{16}$/.test(digits) ? digits : '';
}

/** Reads a respondent NIK despite punctuation/long instructions in Form headers. */
export function readNIKFromSheetRow(headers: string[], row: string[]): string {
  const candidates = headers
    .map((header, index) => ({
      header: String(header ?? '').trim(),
      normalized: normalizeHeader(String(header ?? '')),
      value: String(row[index] ?? '').trim(),
      index,
    }))
    .filter(({ header, normalized, value }) =>
      Boolean(value) && Boolean(normalized) && isLikelyRespondentNIKHeader(header)
    );

  const score = (header: string): number => {
    const normalized = normalizeHeader(header);
    let points = 0;
    if ([
      'nik', 'nikresponden', 'nikppks', 'nomorindukkependudukan',
      'nomorindukkependudukanresponden', 'nomorindukkependudukancalonresponden', 'nomorindukkependudukansesuaiktp', 'nomorindukkependudukanktp', 'nomoridentitasresponden', 'nomoridentitasppks', 'nikcalonresponden', 'nomorktp', 'nomorktpresponden',
      'noktp', 'noktpresponden', 'niksesuaiktp', 'ktpnik', 'nikktp',
    ].includes(normalized)) points += 100;
    if (normalized.includes('responden') || normalized.includes('ppks') || normalized.includes('calonresponden')) points += 60;
    if (normalized.includes('nik')) points += 35;
    if (normalized.includes('ktp')) points += 20;
    if (normalized.includes('nomorindukkependudukan') || normalized.includes('noinduk')) points += 15;
    if (normalized.length > 100) points -= 10;
    return points;
  };

  // Evaluate every recognized column; the first duplicate header may be blank
  // or belong to a different person than the actual respondent field.
  candidates.sort((a, b) => score(b.header) - score(a.header) || a.index - b.index);
  for (const candidate of candidates) {
    const nik = normalizeNIKCellValue(candidate.value);
    if (nik) return nik;
  }
  return '';
}

/** Lists the source column labels recognized as a respondent's NIK. */
export function findNIKHeaders(headers: string[]): string[] {
  return headers.filter((header) => isLikelyRespondentNIKHeader(header)).map((header) => header.trim());
}
