import type { PPKSRecord } from '../types';

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== typeof right) return false;
  if (typeof left !== 'object' || typeof right !== 'object') return false;

  const leftIsArray = Array.isArray(left);
  if (leftIsArray !== Array.isArray(right)) return false;

  if (leftIsArray) {
    const leftArray = left as unknown[];
    const rightArray = right as unknown[];
    if (leftArray.length !== rightArray.length) return false;
    for (let index = 0; index < leftArray.length; index += 1) {
      if (!deepEqual(leftArray[index], rightArray[index])) return false;
    }
    return true;
  }

  const leftObject = left as Record<string, unknown>;
  const rightObject = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftObject);
  const rightKeys = Object.keys(rightObject);
  if (leftKeys.length !== rightKeys.length) return false;
  for (const key of leftKeys) {
    if (!Object.prototype.hasOwnProperty.call(rightObject, key)) return false;
    if (!deepEqual(leftObject[key], rightObject[key])) return false;
  }
  return true;
}

/** Compares JSON-like PPKS records without serializing large photo strings. */
export function arePPKSRecordListsEqual(previous: PPKSRecord[], next: PPKSRecord[]): boolean {
  if (previous === next) return true;
  if (previous.length !== next.length) return false;
  for (let index = 0; index < previous.length; index += 1) {
    if (previous[index].id !== next[index].id) return false;
    if (!deepEqual(previous[index], next[index])) return false;
  }
  return true;
}

/**
 * Applies fresh values while retaining the current roster order and identity
 * whenever content is unchanged. This prevents realtime/polling sync from
 * causing list re-renders, resort flicker, and redundant full localStorage writes.
 */
export function preservePPKSRecordOrder(
  current: PPKSRecord[],
  incoming: PPKSRecord[],
): PPKSRecord[] {
  const incomingById = new Map(incoming.map((record) => [record.id, record]));
  const seen = new Set<string>();
  const ordered: PPKSRecord[] = [];

  for (const record of current) {
    const updated = incomingById.get(record.id);
    if (!updated) continue;
    ordered.push(updated);
    seen.add(updated.id);
  }

  for (const record of incoming) {
    if (seen.has(record.id)) continue;
    ordered.push(record);
    seen.add(record.id);
  }

  return arePPKSRecordListsEqual(current, ordered) ? current : ordered;
}
