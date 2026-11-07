/**
 * Removes inline binary payloads before persisting application state in web storage.
 * Private photos/documents belong in the protected cloud archive, never localStorage.
 */
export function stripPhotoPayloadsFromLocalCache(value: unknown): unknown {
  if (typeof value === 'string') {
    return /^(?:data:image\/|data:application\/|blob:)/i.test(value) ? '' : value;
  }
  if (Array.isArray(value)) return value.map(stripPhotoPayloadsFromLocalCache);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [
        key,
        stripPhotoPayloadsFromLocalCache(child),
      ]),
    );
  }
  return value;
}
