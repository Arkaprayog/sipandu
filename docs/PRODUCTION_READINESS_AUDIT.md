# Audit Kesiapan Produksi — SIPANDU v1.0.0

Tanggal audit: 26 Oktober 2026  
Ruang lingkup: review code statis dan perubahan hardening pada branch rilis. Ini bukan sertifikasi keamanan dan bukan bukti uji end-to-end terhadap project Firebase/Google Workspace produksi.

## Teknologi dan struktur

- React 19, TypeScript, Vite 8, Tailwind CSS 4.
- Firebase Authentication dan Cloud Firestore.
- Google Forms, Sheets, dan Drive melalui OAuth Workspace.
- Capacitor 7 untuk wrapper Android; GitHub Actions menghasilkan APK debug.
- Bun untuk install dependency dan menjalankan tes.

Area penting: `src/App.tsx` (sesi, cache, sinkronisasi, navigasi), `src/components/` (login dan modul UI), `src/lib/firebase.ts`, `src/lib/googleWorkspace.ts`, `src/lib/imageCompression.ts`, `firestore.rules`, `admin-tools/`, `scripts/`, dan `.github/workflows/`.

## Perubahan hardening pada branch ini

1. Menunda parsing cache PPKS yang dapat berisi foto base64 sampai Firebase mengonfirmasi sesi/peran. Ini mengurangi pekerjaan sinkron yang tidak perlu di jalur login.
2. Men-debounce penulisan cache besar, menangani kegagalan kuota penyimpanan, dan memastikan penulisan tidak terjadi sebelum cache terhidrasi.
3. Mengabaikan callback autentikasi usang ketika login/logout berganti cepat, memaksa refresh token saat memeriksa custom claim peran, dan menutup sesi bila peran tidak dapat diverifikasi.
4. Menunda sinkronisasi spreadsheet awal sedikit setelah dashboard mulai tampil, supaya permukaan UI bisa dirender dahulu.
5. Menghapus rekonsiliasi/penghapusan Firestore dan pembersihan demo Drive/Sheets otomatis dari alur login dan sinkronisasi. Penghapusan cloud harus eksplisit, bukan efek samping masuk atau refresh.
6. Memastikan kamera menghentikan track saat modal ditutup, termasuk jika izin kamera selesai setelah modal ditutup; foto sintetis tidak boleh menyamar sebagai foto responden.
7. Mencabut object URL foto sementara ketika layar asesmen dilepas.
8. Menambahkan validasi referensi aset produksi ke workflow Pages dan dokumentasi teknologi/rilis; menargetkan versi aplikasi 1.0.0.

## Temuan risiko dan batasan

- Cache PPKS di `localStorage` dapat berisi data pribadi/foto, bukan penyimpanan terenkripsi. Perangkat bersama atau browser yang terkompromi tetap berisiko. Rekomendasi jangka menengah: jangan menyimpan base64 foto besar dalam localStorage; gunakan penyimpanan file privat dengan kontrol akses dan URL sementara, atau IndexedDB dengan retensi yang jelas.
- Pemeriksaan custom claim di klien hanya untuk UX. Otorisasi wajib ditegakkan di Firestore Security Rules/server; jangan mengandalkan state React untuk melindungi data.
- `firebase-applet-config.json` adalah konfigurasi klien, bukan pengganti aturan akses. Batasi API key dengan API/referrer yang sesuai dan pastikan rules production diuji.
- `admin-tools/` harus hanya berjalan di lingkungan admin tepercaya; service-account key tidak boleh disimpan di frontend, repo, atau artifact.
- Token OAuth dan akses Google Workspace harus dikelola dengan scope minimum dan dibersihkan ketika akun keluar; pastikan setiap endpoint/operasi memeriksa user dan scope yang tepat.
- Tidak dapat menyatakan tidak ada secret di seluruh history Git hanya dari pemeriksaan file saat ini. Jalankan secret scanning di GitHub dan rotasi credential jika ada indikasi kebocoran.
- APK yang dibuat adalah debug APK, bukan artefak release bertanda tangan untuk Play Store/distribusi resmi. Sebelum distribusi, buat release build, konfigurasi signing melalui secrets, verifikasi package ID/versi, dan uji upgrade.
- Keberhasilan build/test tidak membuktikan domain custom, OAuth consent, rules yang benar-benar deployed, izin Drive, push notification saat aplikasi tertutup, atau sinkronisasi data end-to-end sudah berhasil.

## Checklist QA sebelum rilis

### Build dan kualitas kode
- [ ] `bun install --frozen-lockfile`
- [ ] `bun run test`
- [ ] `bun run lint`
- [ ] `bun run build`
- [ ] `node scripts/verify-dist.mjs`
- [ ] Uji di Android dengan jaringan lambat, offline, dan perangkat RAM rendah.

### Autentikasi/otorisasi
- [ ] Owner, supervisor, pendamping: hak akses sesuai peran.
- [ ] Pengguna tanpa custom claim, token kedaluwarsa, akun dinonaktifkan, dan jaringan gagal: ditolak secara aman.
- [ ] Login/logout berulang cepat tidak memunculkan dashboard akun lama.
- [ ] Firestore Rules diuji dengan Firebase Emulator atau Rules Unit Testing; pengguna satu peran tidak dapat membaca/menulis data peran lain.

### Data, foto, dan sinkronisasi
- [ ] Impor Sheet kosong, besar, duplikat, format salah, timeout, dan quota exceeded.
- [ ] Sinkronisasi gagal tidak menimpa data lokal valid dengan daftar kosong.
- [ ] Tidak ada penghapusan dokumen/Drive/Sheet saat login atau refresh biasa.
- [ ] Foto valid dikompresi; ukuran/format salah ditolak; unggah terputus bisa dicoba ulang.
- [ ] Akses URL foto privat ditolak untuk pengguna tanpa hak.
- [ ] Cache penuh dan localStorage dinonaktifkan menghasilkan pesan yang aman tanpa kehilangan data server.

### UI dan resource
- [ ] Login tampak sebelum sinkronisasi spreadsheet berjalan.
- [ ] Navigasi antar tab/modul tidak mengulang fetch yang sama tanpa alasan.
- [ ] Kamera berhenti saat modal ditutup/navigasi/logout; izin ditolak memberi fallback unggah.
- [ ] Object URL dicabut, interval/timeout/listener dibersihkan, dan modal tidak menggandakan listener.
- [ ] Layar kosong, spinner tanpa akhir, dan error boundary diuji dengan kegagalan jaringan/modul.

### Google Workspace dan rilis
- [ ] OAuth consent/scope sesuai kebutuhan dan refresh token tidak dicatat di log.
- [ ] Form, Sheet, Drive diuji dengan akun produksi yang benar tanpa data ODHIV asli di staging.
- [ ] Notifikasi diuji foreground/background/closed-app; notifikasi browser bukan pengganti FCM server-side untuk aplikasi tertutup.
- [ ] Domain custom diverifikasi dari perangkat nyata.
- [ ] APK release ditandatangani dan diuji instalasi baru serta upgrade.

## Keputusan

Status: **perbaikan hardening sedang diverifikasi; belum dinyatakan production-ready** sampai CI branch lulus dan checklist autentikasi, rules, sinkronisasi, domain, dan perangkat nyata diverifikasi. Jangan gunakan build debug ini sebagai bukti bahwa semua integrasi cloud sudah benar.


## Suplemen audit repo dan branding — 28 Oktober 2026

Cakupan tambahan: seluruh pohon repo pada branch `main` (direktori `.github/workflows`, `admin-tools`, `docs`, `public/uploads`, `scripts`, dan `src`), konfigurasi Vite/Capacitor/Wrangler, manifest PWA, Firebase client/rules, generator ikon, serta riwayat build terbaru. Audit ini adalah pemeriksaan statis dan CI; bukan sertifikasi keamanan dan bukan pengganti pengujian perangkat/layanan produksi.

### Perbaikan terverifikasi di kode

- Identitas ikon aplikasi PWA/favicon/iOS dan launcher Android bersumber dari `public/uploads/sipandu-logo.png`; generator hanya menyesuaikan ukuran/penempatan.
- Halaman login memakai file upload `public/uploads/Logo Kemensos Hadir.png`; QR/barcode memakai `public/uploads/logo-kemsos.webp` di tengah.
- Kop Form Asesmen Terintegrasi memakai dua file upload `public/uploads/Logo Kemensos.png` dan `public/uploads/ATENSI HD.png`; tidak ada lambang yang digambar ulang.
- Pemeriksa dist membandingkan SHA-256 sumber dan salinan produksi untuk semua file logo di atas agar tidak ada penggantian gambar.
- Metadata pratinjau sosial menunjuk ikon SIPANDU 512 px yang dibuat dari sumber tersebut.
- Workflow web/Android memakai lockfile Bun yang terkunci dan tidak lagi menjalankan instalasi npm kedua setelah Bun. Workers Builds juga dikonfigurasi untuk menjalankan `bun run build` langsung setelah pemasangan dependency, menghindari kegagalan cache npm `ENOENT` yang ditemukan di log.

### Batasan yang masih perlu validasi operasional

- CI hijau memverifikasi build, test yang terdaftar, pemeriksaan TypeScript, metadata/signature APK, dan aset; itu tidak membuktikan login OAuth Google Workspace, izin Google Form/Sheet/Drive, Firestore Rules yang aktif, atau notifikasi pada perangkat tertutup sudah lolos end-to-end.
- Firestore berisi data pribadi/sensitif. Cache pada `localStorage` masih dapat memuat data dan foto; keamanan tetap memerlukan Rules Firebase aktif, role custom claim dari Admin SDK, serta perangkat/browser yang terlindungi.
- Uji visual logo pada browser desktop, browser ponsel, instalasi PWA iOS, APK debug, dan APK release harus dilakukan setelah deployment selesai. Pengujian scanner QR dengan kamera nyata juga tetap diperlukan.
- Tanda silang pada histori workflow lama tidak terhapus; penilaian rilis harus melihat run terbaru pada SHA terbaru, bukan status commit historis.
