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

const magickArgs = [input, '-auto-orient', '-resize', '900x1800>', '-strip', '-quality', '55', output];
let ok = run('magick', magickArgs);
if (!ok) ok = run('convert', magickArgs);
if (!ok) {
  // Portable fallback for build hosts without ImageMagick.
  ok = run('npx', ['--yes', '--package=sharp-cli', 'sharp', '-i', input, '-o', output, '-f', 'webp', '-q', '55']);
}
if (!ok) {
  throw new Error('Gagal mengonversi gambar latar login ke WebP. Pastikan ImageMagick tersedia atau npm registry dapat dijangkau untuk sharp-cli.');
}

const sourceBytes = fs.statSync(input).size;
const optimizedBytes = fs.statSync(output).size;
if (optimizedBytes >= sourceBytes * 0.6) {
  throw new Error(`WebP tidak cukup kecil: ${optimizedBytes} byte; target di bawah ${Math.round(sourceBytes * 0.6)} byte.`);
}
console.log(`SIPANDU login image: ${sourceBytes} → ${optimizedBytes} bytes (${Math.round((1 - optimizedBytes / sourceBytes) * 100)}% smaller).`);
