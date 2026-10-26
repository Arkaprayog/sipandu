import type { PPKSPhotoKind } from './photoSources';
import { parsePPKSTimestamp } from './ppksData';

export interface FormPhotoResponseCandidate {
  responseId: string;
  timestamp?: string;
  respondentName?: string;
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
export function matchFormPhotoResponseForPPKS(
  respondentName: string,
  respondentTimestamp: string,
  candidates: FormPhotoResponseCandidate[],
  toleranceMs = 3 * 60 * 1000,
): FormPhotoResponseCandidate | null {
  const sourceName = normalizePersonName(respondentName);
  const sourceTime = parsePPKSTimestamp(respondentTimestamp);
  if (!sourceName && sourceTime === null) return null;

  const scored = candidates.map((candidate) => {
    const candidateName = normalizePersonName(candidate.respondentName);
    const candidateTime = parsePPKSTimestamp(candidate.timestamp);
    const nameMatch = !!sourceName && !!candidateName && sourceName === candidateName;
    const nameConflict = !!sourceName && !!candidateName && sourceName !== candidateName;
    const timeDelta = sourceTime !== null && candidateTime !== null
      ? Math.abs(sourceTime - candidateTime)
      : null;
    return { candidate, candidateName, candidateTime, nameMatch, nameConflict, timeDelta };
  }).filter((entry) => !entry.nameConflict);

  const timestampMatches = scored
    .filter((entry) => entry.timeDelta !== null && entry.timeDelta <= toleranceMs)
    .sort((a, b) => {
      if (a.nameMatch !== b.nameMatch) return a.nameMatch ? -1 : 1;
      return (a.timeDelta || 0) - (b.timeDelta || 0);
    });
  if (timestampMatches.length) {
    const best = timestampMatches[0];
    const second = timestampMatches[1];
    // A tie with the same match strength is ambiguous; never assign another
    // respondent's photo based on array order alone.
    if (second && second.nameMatch === best.nameMatch && second.timeDelta === best.timeDelta) {
      return null;
    }
    return best.candidate;
  }

  if (sourceName) {
    const sameName = scored.filter((entry) => entry.nameMatch);
    if (sameName.length === 1) return sameName[0].candidate;
  }
  return null;
}

export function googleDriveViewUrl(fileId: string): string {
  const normalized = String(fileId ?? '').trim();
  if (!/^[a-zA-Z0-9_-]{15,}$/.test(normalized)) return '';
  return `https://drive.google.com/file/d/${normalized}/view`;
}
