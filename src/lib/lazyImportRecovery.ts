const RETRY_STORAGE_PREFIX = 'sipandu:lazy-import-retry:';
const RETRY_QUERY_PARAM = '__sipandu_chunk_retry';

function stripRecoveryQueryParam(): void {
  if (typeof window === 'undefined' || typeof window.history === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(RETRY_QUERY_PARAM)) return;
    url.searchParams.delete(RETRY_QUERY_PARAM);
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${url.search}${url.hash}`,
    );
  } catch {
    // URL cleanup is cosmetic; never prevent the app from starting.
  }
}

stripRecoveryQueryParam();

/** True only for browser errors that commonly mean a cached page points to a missing build chunk. */
export function isRecoverableChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error
    ? `${error.name}: ${error.message}`
    : String(error ?? '');
  return /failed to fetch dynamically imported module|importing a module script failed|failed to load module script|error loading dynamically imported module|loading chunk [^\\s]+ failed|chunkloaderror|unable to preload css for|css chunk[^\\n]*failed/i.test(message);
}

/**
 * Load a Vite lazy chunk and recover once when a stale cached document references
 * a chunk that no longer exists. SessionStorage limits recovery to one automatic
 * cache-busting document reload per module, preventing reload loops. No app data,
 * Firebase data, localStorage, or IndexedDB is cleared.
 */
export async function importLazyModuleWithRecovery<T>(
  moduleKey: string,
  importer: () => Promise<T>,
): Promise<T> {
  const retryKey = `${RETRY_STORAGE_PREFIX}${moduleKey}`;

  try {
    const module = await importer();
    try {
      window.sessionStorage.removeItem(retryKey);
    } catch {
      // Private browsing/storage restrictions must not block a successful import.
    }
    return module;
  } catch (error) {
    if (!isRecoverableChunkLoadError(error) || typeof window === 'undefined') {
      throw error;
    }

    let shouldReload = false;
    try {
      if (window.sessionStorage.getItem(retryKey) !== '1') {
        window.sessionStorage.setItem(retryKey, '1');
        shouldReload = true;
      }
    } catch {
      // If the retry guard cannot be persisted, don't risk an infinite reload loop.
    }

    if (shouldReload) {
      try {
        const freshUrl = new URL(window.location.href);
        freshUrl.searchParams.set(RETRY_QUERY_PARAM, `${moduleKey}-${Date.now()}`);
        window.location.replace(freshUrl.toString());
      } catch {
        // Let the existing error boundary render its detailed diagnostic.
      }
    }

    throw error;
  }
}

/** Manual recovery button: clear only retry guards and request a fresh HTML URL. */
export function reloadSIPANDUWithFreshDocument(): void {
  if (typeof window === 'undefined') return;

  try {
    const storage = window.sessionStorage;
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (key?.startsWith(RETRY_STORAGE_PREFIX)) storage.removeItem(key);
    }
  } catch {
    // Recovery can still proceed if sessionStorage is unavailable.
  }

  try {
    const freshUrl = new URL(window.location.href);
    freshUrl.searchParams.set(RETRY_QUERY_PARAM, `manual-${Date.now()}`);
    window.location.replace(freshUrl.toString());
  } catch {
    window.location.reload();
  }
}
