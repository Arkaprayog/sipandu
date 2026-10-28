import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

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
const sha256File = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

// The app icons must be generated from the uploaded official logo, not an AI substitute.
const iconChecks = [
  ['icons/sipandu-icon-192.png', '192x192'],
  ['icons/sipandu-icon-512.png', '512x512'],
  ['icons/sipandu-apple-touch-icon.png', '180x180'],
  ['icons/sipandu-favicon.png', '48x48'],
];
for (const [relativePath, dimensions] of iconChecks) {
  const iconPath = path.join(dist, relativePath);
  if (!fs.existsSync(iconPath) || fs.statSync(iconPath).size < 1000) {
    fail('Ikon resmi tidak ditemukan atau kosong: dist/' + relativePath);
  }
}
const manifestPath = path.join(dist, 'manifest.webmanifest');
if (!fs.existsSync(manifestPath)) {
  fail('dist/manifest.webmanifest tidak ditemukan.');
} else {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    for (const size of ['192x192', '512x512']) {
      if (!manifest.icons?.some((icon) => icon.sizes === size && icon.type === 'image/png')) {
        fail('Manifest tidak memiliki ikon PNG ukuran ' + size + '.');
      }
    }
  } catch (error) {
    fail('Manifest ikon tidak valid: ' + error.message);
  }
}

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

const suratTugasOriginalPage = path.join(dist, 'uploads', 'surat-tugas-original-background.png');
if (!fs.existsSync(suratTugasOriginalPage) || fs.statSync(suratTugasOriginalPage).size < 100000) {
  fail('Gambar dasar halaman asli Surat Tugas tidak ada atau terlalu kecil pada hasil build.');
} else {
  console.log(`Original Surat Tugas page artwork present: ${fs.statSync(suratTugasOriginalPage).size} bytes.`);
}
// The current editor opens the original PDF with pdf-lib, so the actual PDF source
// must be present in dist. A fingerprinted PNG import is no longer required.
const originalSuratTugasPdf = path.join(dist, 'uploads', 'Surat Tugas.pdf');
if (!fs.existsSync(originalSuratTugasPdf) || fs.statSync(originalSuratTugasPdf).size < 100000) {
  fail('PDF sumber Surat Tugas tidak ada atau terlalu kecil pada hasil build.');
} else {
  console.log(`Original Surat Tugas PDF source present: ${fs.statSync(originalSuratTugasPdf).size} bytes.`);
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

// Enforce the exact logo file supplied by the project owner. No legacy filename,
// alternate artwork, or generated replacement may satisfy this production check.
const repositoryLogoSource = path.resolve('public', 'uploads', 'sipandu-logo.png');
const appLogoSource = path.join(dist, 'uploads', 'sipandu-logo.png');
if (!fs.existsSync(repositoryLogoSource) || fs.statSync(repositoryLogoSource).size < 10000) {
  fail('Sumber logo resmi wajib tersedia: public/uploads/sipandu-logo.png.');
}
if (!fs.existsSync(appLogoSource) || fs.statSync(appLogoSource).size < 10000) {
  fail('Logo SIPANDU wajib disalin ke dist/uploads/sipandu-logo.png.');
} else if (fs.existsSync(repositoryLogoSource)) {
  if (sha256File(repositoryLogoSource) !== sha256File(appLogoSource)) {
    fail('Logo di dist berbeda dari public/uploads/sipandu-logo.png; file sumber harus disalin persis tanpa penggantian artwork.');
  } else {
    console.log('Exact uploaded SIPANDU PNG verified in dist (SHA-256: ' + sha256File(appLogoSource) + ').');
  }
}
// Keep the role-specific uploaded Kemensos/ATENSI assets intact in production.
// These are source images owned by the project; no generated substitute is accepted.
const requiredOfficialLogoAssets = [
  { filename: 'Logo Kemensos Hadir.png', usage: 'logo Kemensos Hadir halaman login' },
  { filename: 'logo-kemsos.webp', usage: 'logo Kemensos di tengah barcode' },
  { filename: 'Logo Kemensos.png', usage: 'logo Kemensos pada kop Form Asesmen Terintegrasi' },
  { filename: 'ATENSI HD.png', usage: 'logo ATENSI pada kop Form Asesmen Terintegrasi' },
];
for (const asset of requiredOfficialLogoAssets) {
  const source = path.resolve('public', 'uploads', asset.filename);
  const built = path.join(dist, 'uploads', asset.filename);
  if (!fs.existsSync(source) || fs.statSync(source).size < 10000) {
    fail('Aset sumber ' + asset.usage + ' tidak tersedia/terlalu kecil: public/uploads/' + asset.filename);
    continue;
  }
  if (!fs.existsSync(built) || fs.statSync(built).size < 10000) {
    fail('Aset ' + asset.usage + ' tidak ikut tersalin ke dist/uploads/' + asset.filename);
    continue;
  }
  if (sha256File(source) !== sha256File(built)) {
    fail('Aset produksi berbeda dari sumber asli public/uploads/' + asset.filename + '; jangan mengganti artwork.');
  } else {
    console.log('Exact uploaded logo verified in dist: uploads/' + asset.filename + ' (' + asset.usage + ').');
  }
}

const pwaIconFiles = [
  'icons/sipandu-favicon.png',
  'icons/sipandu-icon-192.png',
  'icons/sipandu-icon-512.png',
  'icons/sipandu-apple-touch-icon.png',
];
for (const relative of pwaIconFiles) {
  const file = path.join(dist, relative);
  if (!fs.existsSync(file) || fs.statSync(file).size < 1000) {
    fail('Ikon aplikasi tidak ada/kosong pada hasil build: ' + relative);
  }
}
try {
  const manifest = JSON.parse(fs.readFileSync(path.join(dist, 'manifest.webmanifest'), 'utf8'));
  for (const requiredSize of ['192x192', '512x512']) {
    const icon = (manifest.icons || []).find((entry) => entry.sizes === requiredSize && entry.type === 'image/png');
    if (!icon) {
      fail('Manifest PWA tidak memiliki ikon PNG ukuran ' + requiredSize + '.');
      continue;
    }
    const target = path.resolve(dist, 'manifest.webmanifest/..', icon.src.replace(/^\.\//, ''));
    if (!fs.existsSync(target) || fs.statSync(target).size < 1000) {
      fail('Manifest menunjuk ke ikon yang tidak ada: ' + icon.src);
    }
  }
} catch (error) {
  fail('Manifest PWA tidak valid: ' + (error instanceof Error ? error.message : String(error)));
}
for (const link of ['icons/sipandu-favicon.png', 'icons/sipandu-apple-touch-icon.png']) {
  if (!html.includes(link)) fail('index.html tidak menunjuk ke ikon aplikasi yang benar: ' + link);
}


if (/src=["']\/src\/main\.tsx["']/i.test(html)) {
  fail('Index produksi masih menunjuk ke src/main.tsx, bukan berkas hasil build.');
}

if (process.exitCode) process.exit(process.exitCode);
console.log(`SIPANDU build assets verified: ${scriptRefs.length} script entry, ${cssRefs.length} CSS asset, relative paths, manifest, and service worker are present.`);
