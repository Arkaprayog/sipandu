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

// Verify code-split JavaScript modules too; these are fetched after the initial
// entry chunk and can cause a blank page when a base path is wrong.
const assetDirectory = path.join(dist, 'assets');
if (fs.existsSync(assetDirectory)) {
  for (const fileName of fs.readdirSync(assetDirectory).filter((name) => name.endsWith('.js'))) {
    const code = fs.readFileSync(path.join(assetDirectory, fileName), 'utf8');
    for (const match of code.matchAll(/import\(["']([^"']+\.js(?:\?[^"']*)?)["']\)/g)) {
      const reference = match[1];
      if (/^(?:https?:)?\/\//i.test(reference)) continue;
      if (reference.startsWith('/')) {
        fail(\`URL modul dinamis harus relatif: \${fileName} → \${reference}\`);
        continue;
      }
      const pathname = decodeURIComponent(reference.split(/[?#]/, 1)[0]);
      const resolvedPath = path.resolve(assetDirectory, pathname);
      if (!resolvedPath.startsWith(assetDirectory + path.sep) || !fs.existsSync(resolvedPath)) {
        fail(\`Chunk dinamis tidak ditemukan: \${fileName} → \${reference}\`);
      }
    }
  }
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
