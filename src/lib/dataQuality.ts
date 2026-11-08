import type { PPKSRecord } from '../types';

export type PPKSDataQualityIssue =
  | 'nama-kosong'
  | 'nik-tidak-valid'
  | 'nik-duplikat'
  | 'usia-tidak-valid'
  | 'jenis-kelamin-kosong'
  | 'wilayah-kosong'
  | 'alamat-kosong'
  | 'kontak-tidak-valid'
  | 'foto-diri-kosong'
  | 'foto-ktp-kosong';

export interface PPKSDataQualityReport {
  totalRecords: number;
  recordsNeedingReview: number;
  completenessPercent: number;
  issueCounts: Record<PPKSDataQualityIssue, number>;
}

const issueKeys: PPKSDataQualityIssue[] = [
  'nama-kosong', 'nik-tidak-valid', 'nik-duplikat', 'usia-tidak-valid',
  'jenis-kelamin-kosong', 'wilayah-kosong', 'alamat-kosong',
  'kontak-tidak-valid', 'foto-diri-kosong', 'foto-ktp-kosong',
];

function normalizeCandidateNIK(value: unknown): string {
  const raw = String(Array.isArray(value) ? value.join(' ') : value ?? '').trim();
  if (!raw || /^[+-]?\d+(?:[.,]\d+)?e[+-]?\d+$/i.test(raw)) return '';
  const digits = raw.replace(/\D/g, '');
  if (/^\d{16}$/.test(digits)) return digits;
  const matches = [...raw.matchAll(/\d{16}/g)].map((match) => match[0]);
  return matches.length === 1 ? matches[0] : '';
}

function resolveCandidateNIK(record: PPKSRecord): string {
  return normalizeCandidateNIK(record.nik)
    || normalizeCandidateNIK(record.officialAssessment?.q23);
}

/** Read-only audit of loaded roster records. It never edits or merges PPKS data. */
export function analyzePPKSDataQuality(records: PPKSRecord[]): PPKSDataQualityReport {
  const candidateNiks = records.map(resolveCandidateNIK);
  const nikCounts = new Map<string, number>();
  candidateNiks.forEach((nik) => {
    if (nik) nikCounts.set(nik, (nikCounts.get(nik) || 0) + 1);
  });

  const issueCounts = Object.fromEntries(
    issueKeys.map((issue) => [issue, 0]),
  ) as Record<PPKSDataQualityIssue, number>;

  let recordsNeedingReview = 0;
  let validCoreFields = 0;
  const totalCoreFields = records.length * 9;

  records.forEach((record, index) => {
    const nik = candidateNiks[index];
    const duplicateNIK = Boolean(nik && (nikCounts.get(nik) || 0) > 1);
    const age = Number(record.usia);
    const validFields = {
      name: String(record.namaLengkap || '').trim().length > 1,
      nik: /^\d{16}$/.test(nik),
      age: Number.isInteger(age) && age > 0 && age <= 120,
      sex: record.jenisKelamin === 'Laki-laki' || record.jenisKelamin === 'Perempuan',
      region: String(record.kotaDomisili || '').trim().length > 0,
      address: String(record.alamatLengkap || '').trim().length > 0,
      phone: (() => {
        const digits = String(record.noHpWa || '').replace(/\D/g, '');
        return digits.length >= 8 && digits.length <= 15;
      })(),
      portrait: String(record.fotoDiri || record.manualPhotoOverrides?.fotoDiri || '').trim().length > 0,
      identityPhoto: String(record.fotoKtp || record.manualPhotoOverrides?.fotoKtp || '').trim().length > 0,
    };

    const issues: PPKSDataQualityIssue[] = [];
    if (!validFields.name) issues.push('nama-kosong');
    if (!nik) issues.push('nik-tidak-valid');
    if (duplicateNIK) issues.push('nik-duplikat');
    if (!validFields.age) issues.push('usia-tidak-valid');
    if (!validFields.sex) issues.push('jenis-kelamin-kosong');
    if (!validFields.region) issues.push('wilayah-kosong');
    if (!validFields.address) issues.push('alamat-kosong');
    if (!validFields.phone) issues.push('kontak-tidak-valid');
    if (!validFields.portrait) issues.push('foto-diri-kosong');
    if (!validFields.identityPhoto) issues.push('foto-ktp-kosong');

    if (issues.length > 0) recordsNeedingReview += 1;
    issues.forEach((issue) => { issueCounts[issue] += 1; });
    validCoreFields += Object.values(validFields).filter(Boolean).length;
  });

  return {
    totalRecords: records.length,
    recordsNeedingReview,
    completenessPercent: totalCoreFields
      ? Math.round((validCoreFields / totalCoreFields) * 100)
      : 0,
    issueCounts,
  };
}
