import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getLiveSyncRetryDelay,
  LIVE_SYNC_INTERVAL_MS,
  LIVE_SYNC_RETRY_MAX_MS,
} from './liveSyncPolicy';

test('Google Workspace polling keeps a finite steady interval while Firestore is realtime', () => {
  assert.equal(LIVE_SYNC_INTERVAL_MS, 5 * 60 * 1000);
});

test('live sync retries indefinitely with capped exponential backoff', () => {
  assert.equal(getLiveSyncRetryDelay(0), 30_000);
  assert.equal(getLiveSyncRetryDelay(1), 30_000);
  assert.equal(getLiveSyncRetryDelay(2), 60_000);
  assert.equal(getLiveSyncRetryDelay(3), 120_000);
  assert.equal(getLiveSyncRetryDelay(4), 240_000);
  assert.equal(getLiveSyncRetryDelay(5), LIVE_SYNC_RETRY_MAX_MS);
  assert.equal(getLiveSyncRetryDelay(100), LIVE_SYNC_RETRY_MAX_MS);
});
