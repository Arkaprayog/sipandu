import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const input = path.join(root, 'public', 'uploads', 'Wallpaper Background Landingpage.jpg');
const output = path.join(root, 'public', 'uploads', 'Wallpaper Background Landingpage.webp');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit',
    timeout: 120_000,
  });
  return !result.error && result.status === 0 && fs.existsSync(output) && fs.statSync(output).size > 0;
}

if (!fs.existsSync(input)) {
  throw new Error('Sumber gambar latar login tidak ditemukan: ' + input);
}

fs.rmSync(output, { force: true });

// Preserve the source image's full pixel dimensions and encode WebP losslessly.
// Do not resize or use a lossy quality value: both would lower image fidelity.
const magickArgs = [
  input,
  '-auto-orient',
  '-strip',
  '-define', 'webp:lossless=true',
  '-quality', '100',
  output,
];
let ok = run('magick', magickArgs);
if (!ok) ok = run('convert', magickArgs);
if (!ok) {
  // Portable fallback for build hosts without ImageMagick. --lossless keeps
  // every decoded source pixel; no resize or lossy quality setting is applied.
  ok = run('npx', [
    '--yes',
    '--package=sharp-cli',
    'sharp',
    '-i', input,
    '-o', output,
    '-f', 'webp',
    '--lossless',
  ]);
}
if (!ok) {
  throw new Error(
    'Gagal mengonversi wallpaper ke WebP lossless. Pastikan ImageMagick tersedia ' +
    'atau npm registry dapat dijangkau untuk sharp-cli.'
  );
}

const sourceBytes = fs.statSync(input).size;
const optimizedBytes = fs.statSync(output).size;
const delta = Math.round((1 - optimizedBytes / sourceBytes) * 100);
console.log(
  `SIPANDU login image encoded losslessly at original dimensions: ${sourceBytes} → ${optimizedBytes} bytes (${delta}% size reduction; negative means lossless WebP is larger).`
);
