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


export type IntegratedAssessmentAnswersById = Record<string, Record<string, string | string[]>>;

function areAnswerMapsEqual(
  left: Record<string, string | string[]>,
  right: Record<string, string | string[]>,
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => {
    if (!Object.prototype.hasOwnProperty.call(right, key)) return false;
    const a = left[key];
    const b = right[key];
    if (Array.isArray(a) || Array.isArray(b)) {
      return Array.isArray(a) && Array.isArray(b)
        && a.length === b.length
        && a.every((value, index) => value === b[index]);
    }
    return a === b;
  });
}

/**
 * Overlays the canonical answer-only Firestore collection onto the spreadsheet
 * roster. It never creates an incomplete PPKS profile when a roster document is
 * missing, and it preserves the original roster object when answers are unchanged.
 */
export function mergeIntegratedAssessmentAnswers(
  records: PPKSRecord[],
  answersById: IntegratedAssessmentAnswersById,
): PPKSRecord[] {
  let changed = false;
  const merged = records.map((record) => {
    const storedAnswers = answersById[record.id];
    if (!storedAnswers) return record;
    const currentAnswers = record.formAsesmenTerintegrasi || {};
    const nextAnswers = { ...currentAnswers, ...storedAnswers };
    if (areAnswerMapsEqual(currentAnswers, nextAnswers)) return record;
    changed = true;
    return { ...record, formAsesmenTerintegrasi: nextAnswers };
  });
  return changed ? merged : records;
}


const INTEGRATED_QUESTION_KEY = /^q(?:[1-9]|[1-8][0-9]|9[01])$/;
const INTEGRATED_EXTRA_ANSWER_KEYS = new Set([
  'metaSatker',
  'metaYear',
  'metaSequence',
  'kesimpulanResumeKasus',
  'rekomendasiCatatanPetugas',
]);

/** Exact answer keys used by the official standalone integrated assessment form. */
export function isIntegratedAssessmentAnswerKey(key: string): boolean {
  return INTEGRATED_QUESTION_KEY.test(key) || INTEGRATED_EXTRA_ANSWER_KEYS.has(key);
}


export interface IntegratedAssessmentDriveArchiveFile {
  id?: string;
  name?: string;
  mimeType?: string;
  trashed?: boolean;
  appProperties?: Record<string, string>;
}

/**
 * Accept only a PDF or the old assessment JSON format created by SIPANDU,
 * and only inside the matching managed respondent folder. This prevents
 * archive migration from replacing unrelated Google Drive files.
 */
export function isManagedIntegratedAssessmentArchiveFile(
  file: IntegratedAssessmentDriveArchiveFile,
  folderId: string,
): boolean {
  if (!file.id || file.trashed === true || !folderId) return false;
  if (file.appProperties?.sipanduManaged !== 'true'
    || file.appProperties?.sipanduArchive !== folderId) return false;

  const isLegacyJson = file.mimeType === 'application/json'
    && /^asesmen-.*\.json$/i.test(file.name || '');
  const isPdf = file.mimeType === 'application/pdf'
    && /^form-asesmen-terintegrasi-.*\.pdf$/i.test(file.name || '');
  return isLegacyJson || isPdf;
}
