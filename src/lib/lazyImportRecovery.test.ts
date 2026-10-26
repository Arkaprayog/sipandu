import assert from 'node:assert/strict';
import test from 'node:test';
import { isRecoverableChunkLoadError } from './lazyImportRecovery';

test('recognizes stale or missing Vite dynamic JavaScript chunks', () => {
  assert.equal(
    isRecoverableChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://sipanduodhiv.my.id/assets/GoogleWorkspaceModal-C09libYr.js')),
    true,
  );
  assert.equal(isRecoverableChunkLoadError(new TypeError('Importing a module script failed.')), true);
  assert.equal(isRecoverableChunkLoadError(new Error('Loading chunk 123 failed.')), true);
  assert.equal(isRecoverableChunkLoadError(new Error('Unable to preload CSS for /assets/GoogleWorkspaceModal.css')), true);
});

test('does not trigger a page reload for unrelated application/network errors', () => {
  assert.equal(isRecoverableChunkLoadError(new Error('Permission denied while reading PPKS data')), false);
  assert.equal(isRecoverableChunkLoadError(new TypeError('Failed to fetch')), false);
  assert.equal(isRecoverableChunkLoadError(new Error('Firebase request timed out')), false);
});
