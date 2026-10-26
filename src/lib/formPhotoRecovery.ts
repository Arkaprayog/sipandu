import type { PPKSPhotoKind } from './photoSources';
import { parsePPKSTimestamp } from './ppksData';

export interface FormPhotoResponseCandidate {
  responseId: string;
  timestamp?: string;
  respondentName?: string;
  respondentNIK?: string;
  respondentPhone?: string;
  photos: Partial<Record<PPKSPhotoKind, string>>;
}

function normalizePersonName(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('id-ID')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Match a response upload conservatively: exact validated NIK first, then safe
 * name/timestamp fallbacks. The NIK match avoids timezone-related false negatives
 * because Forms timestamps are UTC and Sheets timestamps are commonly local time.
 */
/** A Form title match is insufficient; the linked response spreadsheet ID must match exactly. */
export function isGoogleFormLinkedToSpreadsheet(
  formLinkedSheetId: string | null | undefined,
  spreadsheetId: string,
): boolean {
  return Boolean(formLinkedSheetId && spreadsheetId && formLinkedSheetId === spreadsheetId);
}

function normalizePhone(value: unknown): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  // Normalize Indonesian local numbers and +62 numbers to the same national
  // subscriber form without making assumptions about the subscriber's identity.
  if (digits.startsWith('0062')) return digits.slice(4).replace(/^0+/, '');
  if (digits.startsWith('62')) return digits.slice(2).replace(/^0+/, '');
  return digits.replace(/^0+/, '');
}

export function extractGoogleDriveFileId(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const markdown = raw.match(/\]\((https?:\/\/[^)]+)\)/i);
  const url = markdown?.[1] || raw.match(/https?:\/\/[^\s,;]+/i)?.[0] || raw;
  const path = url.match(/\/(?:file\/)?d\/([a-zA-Z0-9_-]{15,})/);
  if (path) return path[1];
  const query = url.match(/[?&](?:id|fileId)=([a-zA-Z0-9_-]{15,})/);
  if (query && /drive\.google\.com|docs\.google\.com/i.test(url)) return query[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(url)) return url;
  return '';
}

export function countSharedPhotoFileIds(
  sourcePhotos: Partial<Record<PPKSPhotoKind, string>>,
  candidatePhotos: Partial<Record<PPKSPhotoKind, string>>,
): number {
  let count = 0;
  for (const kind of ['diri', 'ktp', 'kk', 'rumah'] as const) {
    const sourceId = extractGoogleDriveFileId(sourcePhotos[kind]);
    const candidateId = extractGoogleDriveFileId(candidatePhotos[kind]);
    if (sourceId && candidateId && sourceId === candidateId) count++;
  }
  return count;
}

function normalizeNIK(value: unknown): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  return /^\d{16}$/.test(digits) ? digits : '';
}

/**
 * Match using the respondent's verified 16-digit NIK first. Names/timestamps are
 * fallbacks only. Google Forms createTime is UTC while Sheets often formats local
 * wall-clock time, so NIK avoids a false no-match caused by timezone conversion.
 */
export function matchFormPhotoResponseForPPKS(
  respondentName: string,
  respondentTimestamp: string,
  candidates: FormPhotoResponseCandidate[],
  toleranceMs = 3 * 60 * 1000,
  respondentNIK = '',
  respondentPhone = '',
): FormPhotoResponseCandidate | null {
  const sourceName = normalizePersonName(respondentName);
  const sourceTime = parsePPKSTimestamp(respondentTimestamp);
  const sourceNIK = normalizeNIK(respondentNIK);
  const sourcePhone = normalizePhone(respondentPhone);

  const scored = candidates.map((candidate) => {
    const candidateName = normalizePersonName(candidate.respondentName);
    const candidateTime = parsePPKSTimestamp(candidate.timestamp);
    const candidateNIK = normalizeNIK(candidate.respondentNIK);
    const candidatePhone = normalizePhone(candidate.respondentPhone);
    const nameMatch = !!sourceName && !!candidateName && sourceName === candidateName;
    const nameConflict = !!sourceName && !!candidateName && sourceName !== candidateName;
    const timeDelta = sourceTime !== null && candidateTime !== null
      ? Math.abs(sourceTime - candidateTime)
      : null;
    const phoneMatch = !!sourcePhone && !!candidatePhone && sourcePhone === candidatePhone;
    const phoneConflict = !!sourcePhone && !!candidatePhone && sourcePhone !== candidatePhone;
    return { candidate, candidateName, candidateNIK, candidatePhone, nameMatch, nameConflict, phoneMatch, phoneConflict, timeDelta };
  });

  if (sourceNIK) {
    const sameNIK = scored.filter((entry) => entry.candidateNIK === sourceNIK);
    if (sameNIK.length === 1) return sameNIK[0].candidate;
    if (sameNIK.length > 1) {
      const withTime = sameNIK
        .filter((entry) => entry.timeDelta !== null && entry.timeDelta <= toleranceMs)
        .sort((a, b) => (a.timeDelta || 0) - (b.timeDelta || 0));
      if (withTime.length && (!withTime[1] || withTime[0].timeDelta !== withTime[1].timeDelta)) {
        return withTime[0].candidate;
      }
      // Repeated submissions with the same NIK and no unique timestamp are
      // ambiguous; don't assign one person's photo to the wrong submission.
      return null;
    }
  }

  if (sourcePhone) {
    const samePhone = scored.filter((entry) =>
      entry.phoneMatch &&
      !(sourceNIK && entry.candidateNIK && entry.candidateNIK !== sourceNIK)
    );
    if (samePhone.length === 1) return samePhone[0].candidate;
    if (samePhone.length > 1) {
      const nameMatches = samePhone.filter((entry) => entry.nameMatch);
      if (nameMatches.length === 1) return nameMatches[0].candidate;
      const timeMatches = samePhone
        .filter((entry) => entry.timeDelta !== null && entry.timeDelta <= toleranceMs)
        .sort((a, b) => (a.timeDelta || 0) - (b.timeDelta || 0));
      if (timeMatches.length && (!timeMatches[1] || timeMatches[0].timeDelta !== timeMatches[1].timeDelta)) {
        return timeMatches[0].candidate;
      }
      return null;
    }
  }

  const nameSafe = scored.filter((entry) =>
    !entry.nameConflict &&
    !(sourceNIK && entry.candidateNIK && entry.candidateNIK !== sourceNIK) &&
    !(sourcePhone && entry.candidatePhone && entry.candidatePhone !== sourcePhone)
  );
  const timestampMatches = nameSafe
    .filter((entry) => entry.timeDelta !== null && entry.timeDelta <= toleranceMs)
    .sort((a, b) => {
      if (a.nameMatch !== b.nameMatch) return a.nameMatch ? -1 : 1;
      return (a.timeDelta || 0) - (b.timeDelta || 0);
    });
  if (timestampMatches.length) {
    const best = timestampMatches[0];
    const second = timestampMatches[1];
    if (second && second.nameMatch === best.nameMatch && second.timeDelta === best.timeDelta) return null;
    return best.candidate;
  }

  if (sourceName) {
    const sameName = nameSafe.filter((entry) => entry.nameMatch);
    if (sameName.length === 1) return sameName[0].candidate;
  }
  return null;
}

export function googleDriveViewUrl(fileId: string): string {
  const normalized = String(fileId ?? '').trim();
  if (!/^[a-zA-Z0-9_-]{15,}$/.test(normalized)) return '';
  return `https://drive.google.com/file/d/${normalized}/view`;
}
