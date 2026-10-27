import type { PPKSRecord } from '../types';
import { parsePPKSTimestamp } from './ppksData';

/**
 * Cutover for the independent Asesmen Tahap Awal link/barcode feed.
 * Older spreadsheet rows remain available in the main Database PPKS, but are
 * not displayed as new stage-one link/barcode submissions.
 */
export const STAGE_ONE_FORM_CUTOVER_ISO = '2026-10-27T11:40:14Z';
export const STAGE_ONE_FORM_CUTOVER_MS = Date.parse(STAGE_ONE_FORM_CUTOVER_ISO);

export function filterStageOneLinkResponses(
  records: readonly PPKSRecord[],
  cutoffMs = STAGE_ONE_FORM_CUTOVER_MS,
): PPKSRecord[] {
  return records.filter((record) => {
    if (record.googleFormSync !== true || !String(record.namaLengkap || '').trim()) return false;
    const submittedAt = parsePPKSTimestamp(record.timestamp);
    return submittedAt !== null && submittedAt >= cutoffMs;
  });
}
