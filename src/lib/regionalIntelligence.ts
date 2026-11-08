import type { PPKSRecord } from '../types';
import { SUMUT_DISTRICTS } from '../data/initialData';
import { normalizeNorthSumatraRegion } from './ppksData';

export type PPKSRegionSource = Pick<PPKSRecord, 'kotaDomisili'>;

export interface PPKSRegionAggregate {
  id: string;
  name: string;
  lat: number;
  lng: number;
  count: number;
}

export interface PPKSRegionSummary {
  regions: PPKSRegionAggregate[];
  matchedRecords: number;
  unmatchedRecords: number;
  missingRegionRecords: number;
}

/**
 * Aggregate PPKS by their recorded administrative domicile.
 * Coordinates are district/city reference points, never respondent coordinates.
 */
export function aggregatePPKSByRegion(records: PPKSRegionSource[]): PPKSRegionSummary {
  const matchers = SUMUT_DISTRICTS
    .flatMap((district) => [district.name, ...district.aliases].map((alias) => ({
      districtId: district.id,
      normalizedAlias: normalizeNorthSumatraRegion(alias),
    })))
    .filter((item) => item.normalizedAlias.length > 2)
    .sort((left, right) => right.normalizedAlias.length - left.normalizedAlias.length);

  const counts = new Map(SUMUT_DISTRICTS.map((district) => [district.id, 0]));
  let unmatchedRecords = 0;
  let missingRegionRecords = 0;

  for (const record of records) {
    const original = String(record.kotaDomisili || '').trim();
    if (!original) {
      missingRegionRecords += 1;
      continue;
    }
    const normalized = normalizeNorthSumatraRegion(original);
    const matched = normalized
      ? matchers.find((candidate) => normalized.includes(candidate.normalizedAlias))
      : undefined;
    if (!matched) {
      unmatchedRecords += 1;
      continue;
    }
    counts.set(matched.districtId, (counts.get(matched.districtId) || 0) + 1);
  }

  const regions = SUMUT_DISTRICTS.map((district) => ({
    id: district.id,
    name: district.name,
    lat: district.lat,
    lng: district.lng,
    count: counts.get(district.id) || 0,
  })).sort((left, right) =>
    right.count - left.count || left.name.localeCompare(right.name, 'id')
  );

  return {
    regions,
    matchedRecords: records.length - unmatchedRecords - missingRegionRecords,
    unmatchedRecords,
    missingRegionRecords,
  };
}
