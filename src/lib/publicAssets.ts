const GITHUB_PAGES_HOSTNAME = 'arkaprayog.github.io';
const GITHUB_PAGES_BASE = '/sipandu/';

/**
 * Resolve a file from Vite's public directory consistently on GitHub Pages
 * (project subpath) and root-hosted deployments such as Cloudflare Workers.
 * Pass an unencoded public path, for example "uploads/sipandu-logo.png".
 */
export function publicAssetUrl(assetPath: string): string {
  const normalized = String(assetPath || '')
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  if (!normalized) throw new Error('Path aset publik SIPANDU tidak boleh kosong.');

  const base = typeof window !== 'undefined' &&
    window.location.hostname.toLowerCase() === GITHUB_PAGES_HOSTNAME
    ? GITHUB_PAGES_BASE
    : '/';
  return base + normalized;
}
