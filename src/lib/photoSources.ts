export type PPKSPhotoKind = 'diri' | 'ktp' | 'kk' | 'rumah';

function normalizePhotoHeader(value: string): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .toLocaleLowerCase('id-ID')
    .replace(/^\\s*\\d{1,2}[\\s.)\\-:]+/, '')
    .replace(/[^a-z0-9]/g, '');
}

const PHOTO_SIGNAL = /(foto|photo|gambar|image|upload|unggah|lampiran|scan|dokumen|berkas|file|tautan|linkdrive|bukti|dokumentasi|selfie|pasfoto|portrait)/;

function scorePhotoHeader(normalized: string, kind: PPKSPhotoKind): number {
  if (!normalized || !PHOTO_SIGNAL.test(normalized)) return 0;

  const isKtp = /(fotoktp|scanktp|upload(?:foto)?ktp|unggah(?:foto)?ktp|lampiranktp|dokumenktp|kartutandapenduduk|kartuidentitas|identitaspenduduk|ektp)/.test(normalized);
  const isKk = /(fotokk|scankk|upload(?:foto)?kk|unggah(?:foto)?kk|lampirankk|dokumenkk|kartukeluarga|kkresponden|dokumenkeluarga)/.test(normalized);
  const isHouse = /(fotorumah|rumah|hunian|tempattinggal|tampakdepan|kondisirumah|kondisihunian)/.test(normalized);
  const isPerson = /(fotodiri|selfie|fotoresponden|fotoppks|wajah|closeup|pasfoto|gambardiri|portrait|fotoindividu|fototampakdepanresponden)/.test(normalized);

  if (kind === 'diri') {
    if (isKtp || isKk || isHouse) return 0;
    if (isPerson) return 100 + (normalized.includes('responden') || normalized.includes('ppks') ? 10 : 0);
    // A generic portrait upload is accepted only when the title does not indicate
    // a different required document type.
    if (/(foto|photo|gambar|image|upload|unggah|selfie|pasfoto|portrait)/.test(normalized)) return 20;
    return 0;
  }
  if (kind === 'ktp') {
    if (isKtp) return 120;
    if (/(ktp|identitaspenduduk|kartutandapenduduk)/.test(normalized) &&
        /(foto|photo|gambar|image|upload|unggah|lampiran|scan|dokumen|berkas|file|tautan|linkdrive|bukti)/.test(normalized)) return 70;
    return 0;
  }
  if (kind === 'kk') {
    if (isKk) return 120;
    if (/(kartukeluarga|dokumenkeluarga)/.test(normalized) &&
        /(foto|photo|gambar|image|upload|unggah|lampiran|scan|dokumen|berkas|file|tautan|linkdrive|bukti)/.test(normalized)) return 70;
    return 0;
  }
  if (kind === 'rumah') {
    if (isHouse && !/(ktp|kartukeluarga|fotokk)/.test(normalized)) return 120;
    return 0;
  }
  return 0;
}

/** Select a non-empty file-upload cell for the requested photo/document category without confusing KTP/KK/house uploads. */
export function readPPKSPhotoSourceByKind(
  headers: string[],
  row: string[],
  kind: PPKSPhotoKind
): string {
  const candidates = headers
    .map((header, index) => ({
      index,
      normalized: normalizePhotoHeader(header),
      value: String(row[index] ?? '').trim(),
    }))
    .map((item) => ({ ...item, score: scorePhotoHeader(item.normalized, kind) }))
    .filter((item) => item.score > 0 && item.value.length > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  return candidates[0]?.value || '';
}
