/**
 * Continuous sync policy. Firestore uses a realtime listener; Google Sheets/Form
 * polling remains deliberately slower to respect external API quotas.
 */
export const LIVE_SYNC_INTERVAL_MS = 5 * 60 * 1000;
export const LIVE_SYNC_RETRY_BASE_MS = 30 * 1000;
export const LIVE_SYNC_RETRY_MAX_MS = 5 * 60 * 1000;

export function getLiveSyncRetryDelay(failedAttempts: number): number {
  const safeAttempt = Number.isFinite(failedAttempts)
    ? Math.max(1, Math.floor(failedAttempts))
    : 1;
  const exponent = Math.min(safeAttempt - 1, 4);
  return Math.min(LIVE_SYNC_RETRY_MAX_MS, LIVE_SYNC_RETRY_BASE_MS * (2 ** exponent));
}
