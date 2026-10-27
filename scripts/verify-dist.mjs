import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
const fail = (message) => {
  console.error(`SIPANDU build verification failed: ${message}`);
  process.exitCode = 1;
};

const indexPath = path.join(dist, 'index.html');
if (!fs.existsSync(indexPath)) {
  fail('dist/index.html tidak ditemukan.');
  process.exit(1);
}

const html = fs.readFileSync(indexPath, 'utf8');

// Guard against regressions in the two fixes for stale entrypoint assets:
// automatic one-shot recovery is inlined in HTML, and Vercel must not cache HTML.
for (const marker of [
  "sipandu:boot-asset-retry:",
  "__sipandu_boot_retry",
  "retryWithFreshDocument",
  // A failed wallpaper/logo preload must not block the entire application.
  "isNonCriticalImageAsset",
  "if (!/\\.(?:m?js|css)"
]) {
  if (!html.includes(marker)) fail('Pemulihan aset awal tidak lengkap pada dist/index.html: ' + marker);
}

const vercelConfigPath = path.resolve('vercel.json');
if (!fs.existsSync(vercelConfigPath)) {
  fail('vercel.json wajib mengatur kebijakan cache agar HTML tidak tertinggal dari aset build.');
} else {
  try {
    const config = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf8'));
    const rules = Array.isArray(config.headers) ? config.headers : [];
    const ignoreCommand = String(config.ignoreCommand || '');
    if (!ignoreCommand.includes('git diff --quiet HEAD^ HEAD') ||
        !ignoreCommand.includes('src') ||
        !ignoreCommand.includes('public') ||
        !ignoreCommand.includes('vercel.json')) {
      fail('Vercel ignoreCommand harus membangun ulang ketika sumber aplikasi, aset publik, atau konfigurasi deployment berubah.');
    }
    const headerValue = (source, headerName) => {
      const rule = rules.find((entry) => entry.source === source);
      const header = rule && Array.isArray(rule.headers)
        ? rule.headers.find((entry) => String(entry.key).toLowerCase() === headerName.toLowerCase())
        : null;
      return header ? String(header.value) : '';
    };
    for (const source of ['/', '/index.html']) {
      const cache = headerValue(source, 'Cache-Control');
      if (!/no-store/i.test(cache) || !/no-cache/i.test(cache) || !/must-revalidate/i.test(cache)) {
        fail('Cache-Control untuk ' + source + ' harus mencegah HTML lama dipakai: ' + (cache || '(tidak ada)'));
      }
    }
    const assetCache = headerValue('/assets/(.*)', 'Cache-Control');
    if (!/immutable/i.test(assetCache) || !/max-age=31536000/i.test(assetCache)) {
      fail('Aset ber-hash harus memiliki cache immutable satu tahun: ' + (assetCache || '(tidak ada)'));
    }
    const swCache = headerValue('/sw.js', 'Cache-Control');
    if (!/no-store/i.test(swCache) || !/must-revalidate/i.test(swCache)) {
      fail('Service worker harus diambil ulang dan tidak boleh tertinggal di cache.');
    }
  } catch (error) {
    fail('vercel.json tidak valid: ' + (error instanceof Error ? error.message : String(error)));
  }
}

const scriptRefs = [...html.matchAll(/<script[^>]+src=["']([^"']+)["'][^>]*>/gi)].map((match) => match[1]);
const cssRefs = [...html.matchAll(/<link[^>]+href=["']([^"']+\.css(?:\?[^"']*)?)["'][^>]*>/gi)].map((match) => match[1]);

if (scriptRefs.length === 0) fail('index.html tidak memiliki entry JavaScript hasil build.');
if (cssRefs.length === 0) fail('index.html tidak memiliki stylesheet hasil build.');

for (const reference of [...scriptRefs, ...cssRefs]) {
  if (/^(?:https?:)?\/\//i.test(reference)) continue;
  if (reference.startsWith('/')) {
    fail(`URL aset harus relatif untuk GitHub Pages dan domain root: ${reference}`);
    continue;
  }
  const pathname = decodeURIComponent(reference.split(/[?#]/, 1)[0]).replace(/^\.\//, '');
  const filePath = path.resolve(dist, pathname);
  if (!filePath.startsWith(dist + path.sep) || !fs.existsSync(filePath)) {
    fail(`Aset dirujuk tidak ada di dist: ${reference}`);
  } else if (fs.statSync(filePath).size === 0) {
    fail(`Aset kosong: ${reference}`);
  }
}

// The startup shell intentionally loads App as a separate chunk so the first
// screen renders before large Firebase/Workspace dependencies are downloaded.
// References to every dynamic JS/CSS dependency are validated below.
const assetDirectory = path.join(dist, 'assets');
if (fs.existsSync(assetDirectory)) {
  const splitAppModules = fs.readdirSync(assetDirectory).filter((name) => name.startsWith('App-') && name.endsWith('.js'));
  for (const moduleName of splitAppModules) {
    const modulePath = path.join(assetDirectory, moduleName);
    if (fs.statSync(modulePath).size === 0) fail('Chunk aplikasi kosong: ' + moduleName);
  }
}
const checkChunkReference = (ownerFile, reference) => {
  if (/^(?:https?:)?\/\//i.test(reference)) return;
  if (reference.startsWith('/')) {
    fail('URL modul hasil build harus relatif: ' + ownerFile + ' → ' + reference);
    return;
  }
  const pathname = decodeURIComponent(reference.split(/[?#]/, 1)[0]);
  const filePath = path.resolve(assetDirectory, pathname);
  if (!filePath.startsWith(dist + path.sep) || !fs.existsSync(filePath)) {
    fail('Chunk hasil build tidak ditemukan: ' + ownerFile + ' → ' + reference);
  } else if (fs.statSync(filePath).size === 0) {
    fail('Chunk hasil build kosong: ' + ownerFile + ' → ' + reference);
  }
};

if (fs.existsSync(assetDirectory)) {
  for (const fileName of fs.readdirSync(assetDirectory).filter((name) => name.endsWith('.js'))) {
    const code = fs.readFileSync(path.join(assetDirectory, fileName), 'utf8');
    // Match import("chunk.js"), import('chunk.js'), and template-literal imports.
    for (const match of code.matchAll(/import\((["'\x60])([^"'\x60]+\.js(?:\?[^"'\x60]*)?)\1\)/g)) {
      checkChunkReference(fileName, match[2]);
    }
    // CSS dependencies are stored in Vite's __vite__mapDeps preload array.
    for (const map of code.matchAll(/m\.f=\[([^\]]*)\]/g)) {
      for (const reference of map[1].matchAll(/["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/g)) {
        checkChunkReference(fileName, reference[1]);
      }
    }
  }
}


const editableSuratTugas = path.join(dist, 'uploads', 'Surat Tugas - Template Editable Terkunci.docx');
if (!fs.existsSync(editableSuratTugas) || fs.statSync(editableSuratTugas).size < 50000) {
  fail('Template Surat Tugas editable tidak ada atau kosong di dist/uploads. Periksa generator locked DOCX.');
} else {
  console.log(`Locked editable Surat Tugas template present: ${fs.statSync(editableSuratTugas).size} bytes.`);
}

const loginBackground = path.join(dist, 'uploads', 'Wallpaper Background Landingpage.webp');
const originalLoginBackground = path.join(dist, 'uploads', 'Wallpaper Background Landingpage.jpg');
if (!fs.existsSync(loginBackground) || fs.statSync(loginBackground).size === 0) {
  fail('Gambar WebP latar login tidak ada/kosong pada hasil build.');
} else if (fs.existsSync(originalLoginBackground)) {
  const webpBytes = fs.statSync(loginBackground).size;
  const originalBytes = fs.statSync(originalLoginBackground).size;
  // Lossless WebP preserves all decoded source pixels and original dimensions.
  // Its byte size can exceed JPEG because the source JPEG is already lossy-compressed;
  // never force lossy recompression just to satisfy an arbitrary size threshold.
  console.log(`Login background lossless WebP present: JPEG ${originalBytes} bytes; WebP ${webpBytes} bytes (${Math.round((1 - webpBytes / originalBytes) * 100)}% size reduction).`);
}

for (const required of ['manifest.webmanifest', 'sw.js']) {
  const file = path.join(dist, required);
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
    fail(`Berkas publik wajib hilang/kosong: ${required}`);
  }
}

if (/src=["']\/src\/main\.tsx["']/i.test(html)) {
  fail('Index produksi masih menunjuk ke src/main.tsx, bukan berkas hasil build.');
}

if (process.exitCode) process.exit(process.exitCode);
console.log(`SIPANDU build assets verified: ${scriptRefs.length} script entry, ${cssRefs.length} CSS asset, relative paths, manifest, and service worker are present.`);
