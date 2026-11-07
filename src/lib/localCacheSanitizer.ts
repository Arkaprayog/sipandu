/**
 * Removes photo/document payloads and photo references before persisting application
 * state in web storage. Private media belongs in the protected cloud archive.
 */
export function stripPhotoPayloadsFromLocalCache(value: unknown): unknown {
  if (typeof value === 'string') {
    return /^(?:data:image\/|data:application\/|blob:)/i.test(value) ? '' : value;
  }
  if (Array.isArray(value)) return value.map(stripPhotoPayloadsFromLocalCache);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        // Do not retain photo URLs either: signed URLs can grant access to private media.
        .filter(([key]) => !/^(?:foto|photo|avatar|image|gambar)/i.test(key))
        .map(([key, child]) => [key, stripPhotoPayloadsFromLocalCache(child)]),
    );
  }
  return value;
}
