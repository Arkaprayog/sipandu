import type { PPKSPhotoKind } from './photoSources';
import { parsePPKSTimestamp } from './ppksData';

export interface FormPhotoResponseCandidate {
  responseId: string;
  timestamp?: string;
  respondentName?: string;
  respondentNIK?: string;
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
 * Match a response upload to a spreadsheet person conservatively. Prefer both
 * an exact normalized name and a close timestamp; if the name is unavailable,
 * timestamp proximity alone must be very close. If timestamp is unavailable,
 * allow name-only only when that name occurs exactly once in the response list.
 */
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
): FormPhotoResponseCandidate | null {
  const sourceName = normalizePersonName(respondentName);
  const sourceTime = parsePPKSTimestamp(respondentTimestamp);
  const sourceNIK = normalizeNIK(respondentNIK);

  const scored = candidates.map((candidate) => {
    const candidateName = normalizePersonName(candidate.respondentName);
    const candidateTime = parsePPKSTimestamp(candidate.timestamp);
    const candidateNIK = normalizeNIK(candidate.respondentNIK);
    const nameMatch = !!sourceName && !!candidateName && sourceName === candidateName;
    const nameConflict = !!sourceName && !!candidateName && sourceName !== candidateName;
    const timeDelta = sourceTime !== null && candidateTime !== null
      ? Math.abs(sourceTime - candidateTime)
      : null;
    return { candidate, candidateName, candidateNIK, nameMatch, nameConflict, timeDelta };
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

  const nameSafe = scored.filter((entry) =>
    !entry.nameConflict &&
    !(sourceNIK && entry.candidateNIK && entry.candidateNIK !== sourceNIK)
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
