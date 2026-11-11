import type { PPKSRecord } from '../types';

function normalizedName(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('id-ID')
    .replace(/[^a-z0-9]/g, '');
}

function normalizedNIK(record: PPKSRecord): string {
  const value = String(record.nik || record.officialAssessment?.q23 || '').replace(/\D/g, '');
  return /^\d{16}$/.test(value) ? value : '';
}

/**
 * Join the profile feed ("From Responses 1") to the ARV answer in
 * "From Asesmen 1". A linked PPKS ID is preferred; otherwise the full name
 * must be unique, and two present NIKs must agree. Ambiguous rows are skipped.
 */
export function mergeAtensiArvDurations(
  profileRecords: PPKSRecord[],
  assessmentRecords: PPKSRecord[],
): { records: PPKSRecord[]; matched: number } {
  const profileNameCounts = new Map<string, number>();
  const assessmentNameCounts = new Map<string, number>();
  for (const record of profileRecords) {
    const name = normalizedName(record.namaLengkap);
    if (name) profileNameCounts.set(name, (profileNameCounts.get(name) || 0) + 1);
  }
  for (const record of assessmentRecords) {
    const name = normalizedName(record.namaLengkap);
    if (name) assessmentNameCounts.set(name, (assessmentNameCounts.get(name) || 0) + 1);
  }

  let matched = 0;
  const records = profileRecords.map((profile) => {
    const profileName = normalizedName(profile.namaLengkap);
    const profileNIK = normalizedNIK(profile);
    const idMatches = assessmentRecords.filter((assessment) =>
      Boolean(profile.id && assessment.id === profile.id) &&
      (!profileNIK || !normalizedNIK(assessment) || profileNIK === normalizedNIK(assessment))
    );
    let candidates = idMatches;

    if (candidates.length === 0 && profileName) {
      candidates = assessmentRecords.filter((assessment) => {
        const assessmentName = normalizedName(assessment.namaLengkap);
        if (!assessmentName || assessmentName !== profileName) return false;
        const assessmentNIK = normalizedNIK(assessment);
        if (profileNIK && assessmentNIK) return profileNIK === assessmentNIK;
        return profileNameCounts.get(profileName) === 1 &&
          assessmentNameCounts.get(assessmentName) === 1;
      });
    }

    if (candidates.length !== 1) return profile;
    const arv = String(candidates[0].lamaTerapiArv || '').trim();
    if (!arv) return profile;
    matched += 1;
    return { ...profile, lamaTerapiArv: arv };
  });

  return { records, matched };
}
