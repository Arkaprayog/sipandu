import type { PPKSRecord } from '../types';

/** Identity-only fields are prefilled from the PPKS master record, not completed answers. */
const IDENTITY_ONLY_ANSWERS = new Set(['q5', 'q15', 'q16', 'q19', 'q23', 'q25']);

export function hasCompletedIntegratedAnswers(record: Pick<PPKSRecord, 'formAsesmenTerintegrasi'>): boolean {
  const answers = record.formAsesmenTerintegrasi;
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return false;
  return Object.entries(answers).some(([key, value]) => {
    if (IDENTITY_ONLY_ANSWERS.has(key.toLowerCase())) return false;
    if (Array.isArray(value)) return value.some((item) => String(item ?? '').trim() !== '');
    return String(value ?? '').trim() !== '';
  });
}

/**
 * Return only assessment-bearing Firestore records missing from the local roster.
 * This keeps the archive consistent across browser/APK caches without importing
 * the whole Firestore roster or reviving outdated PPKS records.
 */
export function getCloudOnlyCompletedAssessments(
  localRecords: PPKSRecord[],
  cloudRecords: PPKSRecord[],
): PPKSRecord[] {
  const localIds = new Set(localRecords.map((record) => record.id));
  return cloudRecords.filter((record) =>
    !localIds.has(record.id) && hasCompletedIntegratedAnswers(record)
  );
}
