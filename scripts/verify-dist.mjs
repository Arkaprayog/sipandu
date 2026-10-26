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

// Verify code-split JavaScript and CSS modules from Vite's preload map.
// Vite can emit dynamic imports using quote characters or a template literal.
const assetDirectory = path.join(dist, 'assets');
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
