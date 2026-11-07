import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { spawnSync } from 'node:child_process';
import type { Plugin } from 'vite';
import {defineConfig} from 'vite';


function optimizeLoginBackground(): Plugin {
  return {
    name: 'sipandu-optimize-login-background',
    enforce: 'pre',
    configResolved(config) {
      if (config.command !== 'build') return;
      // Personal Surat Tugas documents and signature QR assets are not part of
      // the public application bundle. The dormant legacy editor was retired.

      // Generate the favicon, PWA install icons, and iOS home-screen icon from
      // the uploaded official SIPANDU logo on every build (including hosted builds).
      const pwaIconScript = path.resolve(config.root, 'scripts/generate_pwa_icons.py');
      const pwaIconResult = spawnSync('python3', [pwaIconScript], {
        cwd: config.root,
        stdio: 'inherit',
        timeout: 120_000,
      });
      if (pwaIconResult.error || pwaIconResult.status !== 0) {
        throw new Error(
          'SIPANDU build dihentikan karena ikon PWA/iOS tidak berhasil dibuat. ' +
          (pwaIconResult.error?.message || `Status generator: ${pwaIconResult.status}`)
        );
      }

      const scriptPath = path.resolve(config.root, 'scripts/optimize-login-background.mjs');
      const result = spawnSync('node', [scriptPath], {
        cwd: config.root,
        stdio: 'inherit',
        timeout: 120_000,
      });
      if (result.error || result.status !== 0) {
        throw new Error(
          'SIPANDU build dihentikan karena gambar latar login tidak berhasil dioptimalkan. ' +
          (result.error?.message || `Status optimizer: ${result.status}`)
        );
      }
    },
  };
}

export default defineConfig(() => {
  return {
    // Relative asset URLs work on both the GitHub Pages project path (/sipandu/)
    // and the custom-domain root (sipanduodhiv.my.id/).
    base: './',
    plugins: [optimizeLoginBackground(), react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
