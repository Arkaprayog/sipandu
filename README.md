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
- Ikon aplikasi PWA/favicon/iOS, launcher Android, dan notifikasi dipulihkan dari aset asli `public/uploads/App Icon Picture.png` yang dipertahankan persis dalam arsip repositori. Generator hanya menyiapkan ukuran Android/PWA; tidak membuat artwork baru.
- `public/uploads/sipandu-logo.png` tetap digunakan sebagai logo identitas pada komponen UI, bukan sebagai pengganti ikon launcher asli.
- Logo halaman login menggunakan file asli `public/uploads/Logo Kemensos Hadir.png`.
- Logo di tengah QR/barcode menggunakan file asli `public/uploads/logo-kemsos.webp`.
- Kop `Form Asesmen Terintegrasi` menggunakan `public/uploads/Logo Kemensos.png` dan `public/uploads/ATENSI HD.png` secara langsung.
- Semua gambar logo berasal dari aset repo. Jangan menggambar ulang, menghasilkan dengan AI, mengambil dari internet, atau mengganti dengan gambar lain. Ikon launcher asli dipulihkan oleh `scripts/restore_original_app_icon.py` dan diverifikasi berdasarkan SHA-256. `node scripts/verify-dist.mjs` memeriksa hasil salinan produksi berdasarkan SHA-256.

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


## Alur Asesmen Tahap Awal dan Google Form utama

- Tautan/barcode Tahap Awal membuka formulir native SIPANDU di `/?mode=asesmen-tahap-awal`, tanpa login staf dan tanpa mengalihkan responden ke Google Forms.
- Respons disimpan pada koleksi Firestore terpisah `stageOneIntake`; pembacaan hanya tersedia untuk petugas dengan role SIPANDU, sedangkan kiriman publik hanya boleh membuat dokumen dengan skema yang divalidasi.
- Petugas dapat mengisi formulir Tahap Awal dari dashboard dan memakai database intake yang sama.
- Dari database Tahap Awal, petugas mengirim tautan Google Form utama dengan jawaban terisi otomatis. Entry ID harus diambil dari tautan prefilled Google Forms asli lalu dikonfigurasi pada Pengaturan SIPANDU (nama, NIK, usia, jenis kelamin, domisili, nomor WA, jenis bantuan, dan ID PPKS); ID tidak ditebak.
- Respons Google Form utama disinkronkan dari spreadsheet respons yang tertaut dan dipadankan kembali menggunakan ID PPKS.
- Perubahan `firestore.rules` harus diterapkan ke Firebase aktif secara terpisah; workflow frontend/Cloudflare tidak menerapkan aturan Firestore secara otomatis.

## Penyimpanan Form Asesmen Terintegrasi

- Jawaban formulir disimpan langsung ke field Firestore `ppks/{id}.formAsesmenTerintegrasi`, terpisah dari jawaban impor Google Forms/Sheets.
- Role `pendamping` hanya dapat memperbarui field tersebut pada dokumen PPKS yang sudah ada. Role ini tetap tidak dapat mengubah profil utama, NIK, foto, status, membuat, atau menghapus dokumen PPKS.
- Tombol **Simpan Form** menampilkan keberhasilan hanya setelah Firebase mengonfirmasi penulisan. Kegagalan izin, sesi, jaringan, atau dokumen yang belum tersinkron ditampilkan sebagai pesan gagal.
- Worker Cloudflare `sipandu` hanya menyajikan aset aplikasi; penyimpanan jawaban dilakukan langsung oleh Firebase SDK ke database Firestore bernama yang dikonfigurasi aplikasi.
- Setelah memeriksa Rules dan mengujinya di emulator, administrator Firebase harus menerapkan aturan ke database target. Dari root repositori, gunakan: `firebase deploy --only firestore:ai-studio-sipanduodhiv-985a0308-7693-46e1-b6d3-fdbce52371a8 --project gen-lang-client-0197631978`. Deployment Rules akan mengganti aturan aktif database tersebut dengan isi `firestore.rules`; pastikan aturan lain yang dibutuhkan tetap tercakup sebelum deploy.


## Arsip Dokumen SIPANDU

- **Upload Berkas** menyimpan file asli ke Firebase Storage pada folder `staff-documents/{uid}/{documentId}/` dan membuat metadata di koleksi Firestore `staffDocuments`.
- Arsip dibagikan kepada akun staf dengan custom claim `role` `owner`, `supervisor`, atau `pendamping`. Pendamping hanya dapat menghapus file miliknya sendiri; owner/supervisor dapat menghapus semua file.
- Format yang diizinkan: PDF, DOC/DOCX, JPG/JPEG, PNG, GIF, WEBP, BMP, TIFF, HEIC, HEIF. Batas ukuran 25 MB.
- Keberhasilan baru ditampilkan setelah upload binary dan penyimpanan metadata keduanya berhasil. Jika metadata Firestore gagal disimpan, file Storage yang baru diunggah akan dihapus kembali untuk menghindari file yatim.
- Firebase Authentication menggunakan IndexedDB persistence pada Android native dengan localStorage sebagai fallback; PWA/browser menggunakan localStorage dengan IndexedDB sebagai fallback. Ini membantu mempertahankan sesi saat pemilih file Android membuat Activity berada di latar belakang atau dibuat ulang.
- Administrator harus mengaktifkan Firebase Storage pada proyek `gen-lang-client-0197631978`, lalu menerapkan kedua aturan dari root repositori:
  `firebase deploy --only firestore:ai-studio-sipanduodhiv-985a0308-7693-46e1-b6d3-fdbce52371a8,storage --project gen-lang-client-0197631978`.
- Pastikan Storage bucket `gen-lang-client-0197631978.firebasestorage.app` tersedia sebelum menguji upload produksi. Worker Cloudflare hanya menyajikan aset; file disimpan oleh Firebase Storage.


## Pendaftaran mandiri anggota SIPANDU

- Halaman login menyediakan tautan teks **Sudah memiliki akun? Buat akun** yang membuka formulir pendaftaran.
- Pendaftaran memerlukan nama, NIP, jabatan, unit kerja, email, password, konfirmasi password, dan kode pendaftaran tim bersama.
- Email harus diverifikasi sebelum akun baru diaktifkan. Setelah verifikasi, anggota masuk kembali dengan email dan password.
- Profil anggota disimpan pada dokumen Firestore pribadi `userProfiles/{uid}`, sehingga nama, NIP, jabatan, dan unit kerja otomatis muncul ketika akun dipakai pada perangkat lain. Foto profil dapat diunggah kemudian; menu Edit Profil tetap tersedia.
- Role `pendamping` diberikan hanya oleh Worker Cloudflare terpisah setelah memvalidasi undangan dan status email Firebase. Browser tidak dapat mengatur custom claim.
- Ikuti [panduan konfigurasi Worker pendaftaran](registration-worker/README.md) sebelum mengaktifkan tautan pendaftaran untuk anggota. Worker statis `sipandu` tidak diganti.
