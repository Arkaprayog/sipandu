# SIPANDU ODHIV

Sistem Informasi & Pendampingan Terpadu untuk pengelolaan Database PPKS ODHIV Sumatera Utara.

## Teknologi utama

- React 19 + TypeScript
- Vite 8 + Tailwind CSS 4
- Firebase Authentication dan Cloud Firestore
- Google Forms, Sheets, dan Drive REST APIs melalui OAuth Workspace
- Capacitor 7 untuk membangun aplikasi Android; GitHub Actions memvalidasi APK debug dan release
- Bun sebagai package manager dan runner tes

## Struktur direktori penting

- `src/App.tsx`: status sesi, navigasi, cache lokal, orkestrasi sinkronisasi
- `src/components/`: Login, Beranda, Database PPKS, Asesmen, From Asesmen Terintegrasi, Dokumen, modal, kamera, foto privat
- `src/lib/firebase.ts`: Firebase Authentication/Firestore dan OAuth Workspace
- `src/lib/googleWorkspace.ts`: integrasi Google Forms, Sheets, dan Drive
- `src/lib/imageCompression.ts`: kompresi foto sebelum disimpan
- `src/lib/respondentNotifications.ts`: histori dan notifikasi responden
- `firestore.rules`: policy akses Firestore yang harus diuji dan diterapkan ke database target
- `admin-tools/`: utilitas Admin SDK untuk administrator tepercaya
- `scripts/`: generator ikon dari logo resmi, optimasi latar login, generator dokumen, dan pemeriksaan aset/bytecode produksi
- `.github/workflows/`: build/deploy web dan build Android debug


## Sumber identitas/logo aplikasi

- Logo resmi aplikasi adalah **file yang diunggah pemilik proyek**: `public/uploads/sipandu-logo.png`. Jangan menggambar ulang, menghasilkan dengan AI, atau mengganti file tersebut dengan artwork lain.
- Ikon aplikasi PWA/favicon/iOS dan launcher Android bersumber dari `public/uploads/sipandu-logo.png`; generator hanya mengubah ukuran/penempatan, bukan desain logo.
- Logo halaman login menggunakan file asli `public/uploads/Logo Kemensos Hadir.png`.
- Logo di tengah QR/barcode menggunakan file asli `public/uploads/logo-kemsos.webp`.
- Kop `Form Asesmen Terintegrasi` menggunakan `public/uploads/Logo Kemensos.png` dan `public/uploads/ATENSI HD.png` secara langsung.
- Semua gambar logo berasal dari aset repo. Jangan menggambar ulang, menghasilkan dengan AI, mengambil dari internet, atau mengganti dengan gambar lain. `node scripts/verify-dist.mjs` memeriksa hasil salinan produksi berdasarkan SHA-256.

## Menjalankan secara lokal

Prasyarat: Bun sesuai versi CI, Node.js, dan koneksi internet.

```sh
bun install --frozen-lockfile
bun run dev
```

Validasi lokal:

```sh
bun run test
bun run lint
bun run build
node scripts/verify-dist.mjs
```

File `firebase-applet-config.json` berisi konfigurasi klien Firebase yang memang disertakan ke aplikasi browser. Firebase Web API key bukan kunci Admin/service-account, tetapi tetap batasi API key di Google Cloud Console dan gunakan Firebase Authentication, custom claims, serta Firestore Rules untuk otorisasi. Jangan commit service-account JSON, token OAuth, password, atau rahasia server.

Integrasi Google harus diuji dengan akun OAuth dan spreadsheet/drive/Form target yang sebenarnya. Build sukses tidak membuktikan izin OAuth, Firestore Rules yang benar-benar deployed, akses Drive, atau sinkronisasi end-to-end sudah benar.

## Status keamanan rilis

Lihat [Audit kesiapan produksi v1.0.0](docs/PRODUCTION_READINESS_AUDIT.md). Nomor major dan APK debug adalah awal rilis aplikasi; keduanya bukan pengganti pemeriksaan akses data PPKS/ODHIV, verifikasi rules pada Firebase aktif, serta uji end-to-end dengan peran pengguna berbeda.
