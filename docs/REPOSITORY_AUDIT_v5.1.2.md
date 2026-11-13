# Laporan Audit Repositori SIPANDU — 5.1.2

Tanggal pemeriksaan: 13 November 2026
Branch dasar: main
Commit dasar: 3ad9ac71353b8fe17e2f06690fc10a34a36b0bbc

## Cakupan pemeriksaan

Pemeriksaan membaca implementasi dan konfigurasi jalur berikut:

1. **Autentikasi dan pendaftaran** — LoginPage, RegistrationPage, helper aktivasi, Registration Worker, pemulihan akun, verifikasi email, dan pemuatan custom claims.
2. **Otorisasi dan privasi** — Firestore Rules, Storage Rules, serta pengujian emulator untuk owner, supervisor, pendamping, anggota, dan responden.
3. **Data responden** — PPKS, intake tahap awal dengan Turnstile, sinkronisasi roster, status layanan, dan kunjungan lapangan.
4. **Asesmen** — penyimpanan jawaban, identitas kontrol pertanyaan/jawaban pada salinan cetak, layout A4, pemisahan halaman berdasarkan batas baris, lampiran foto, serta arsip PDF melalui Worker.
5. **Komunikasi dan dokumen** — percakapan/direct message, kepemilikan dokumen petugas, validasi tipe/ukuran file, serta akses arsip melalui Worker.
6. **Distribusi aplikasi** — boot recovery, metadata versi, PWA, workflow GitHub Pages, CodeQL, Firebase Rules, Android APK, dan deployment Worker.

## Temuan dan tindak lanjut

### 1. Dokumentasi pendaftaran mandiri tidak sesuai implementasi — diperbaiki

README sebelumnya menyebut NIP, jabatan, dan unit kerja sebagai kolom wajib pendaftaran serta menyebut role pendamping ditetapkan setelah undangan. Formulir aktual meminta nama, email, password, dan konfirmasi password. Profil tambahan dapat diisi setelah akun dibuat; aktivasi mandiri menetapkan role anggota setelah email diverifikasi. README sekarang mengikuti alur aktual.

### 2. Proteksi branch main belum aktif — belum dapat diterapkan dari koneksi ini

Status branch yang diperiksa menunjukkan main belum protected. Ini penting karena workflow push ke main menjalankan deployment produksi. Issue #231 sudah mencatat kebutuhan aturan wajib: PR/review, larangan force-push dan penghapusan branch, serta pemeriksaan CI yang sesuai. Aktivasi branch protection/ruleset membutuhkan pengaturan administrasi repositori; pemeriksaan baca yang tersedia tidak menyediakan operasi untuk mengubah pengaturan tersebut. Jangan menganggap risiko ini sudah ditutup oleh perubahan kode dalam PR audit.

### 3. Akses akun anggota — implementasi dan tes sudah tersedia

Registration Worker mencatat pendaftaran mandiri dan hanya mengaktifkan akun setelah email diverifikasi serta UID/email cocok. Worker menetapkan role anggota dan menolak penimpaan role staf yang sudah ada. Firestore/Storage Rules tidak memasukkan anggota ke fungsi isStaff; tes emulator memverifikasi bahwa anggota tidak dapat membaca atau menulis PPKS, asesmen, arsip, dokumen staf, layanan, kunjungan, percakapan, atau file Storage, dan hanya dapat mengelola profil dengan UID sendiri.

### 4. Alur asesmen dan PDF — tidak ditemukan cacat tambahan yang dapat dibuktikan dari inspeksi kode

Implementasi saat ini mengambil snapshot responden/jawaban sebelum pembuatan PDF, memeriksa keselarasan identitas kontrol sumber dan salinan cetak, membungkus jawaban dalam kolom, memecah lembar pada batas baris, dan mempertahankan urutan enam halaman formulir diikuti empat lampiran foto. Worker arsip memverifikasi tipe, ukuran, folder, dan penanda arsip sebelum mengembalikan PDF. Hasil cetak tetap harus diuji pada perangkat dan printer nyata karena inspeksi kode tidak dapat membuktikan posisi fisik hasil cetak.

## Bukti pemeriksaan otomatis

Pada pemeriksaan audit ini, workflow terbaru yang terlihat pada main untuk CodeQL Security Scan, GitHub Pages, Native Android APK and Release, Android private release APK, dan Deploy SIPANDU application Worker berstatus berhasil. Workflow Firebase Rules memiliki job emulator tersendiri pada perubahan rules/config atau package; hasil job PR untuk branch audit harus diperiksa sebelum merge.

## Batas audit

Audit ini meninjau jalur kode dan file konfigurasi repositori, bukan seluruh kombinasi akun, jaringan, izin OAuth, secret Cloudflare, project Firebase, browser, dan printer. Tidak ada akses untuk menjalankan transaksi end-to-end pada akun produksi dari pemeriksaan ini. Tidak ada data responden atau secret yang diubah. Perubahan branch audit tidak men-deploy aplikasi produksi; deployment tetap mengikuti workflow branch main.
