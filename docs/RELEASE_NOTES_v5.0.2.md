# SIPANDU ODHIV — Catatan Rilis v5.0.2

Tanggal: 9 November 2026

## Perbaikan Google Forms API HTTP 403
- Menambahkan OAuth scope resmi `https://www.googleapis.com/auth/forms.responses.readonly` ke alur Google OAuth web, redirect/embedded browser, dan Android native sign-in.
- Memperbarui pemulihan izin Google yang dipicu pengguna agar menampilkan layar persetujuan OAuth ketika scope baru diperlukan. Refresh otomatis latar belakang tetap menggunakan alur senyap dan tidak meminta persetujuan berulang.
- Memperjelas pesan HTTP 403 agar menyebut scope respons Forms, langkah pulihkan izin, API yang perlu aktif, dan kebutuhan akses akun ke Form sumber.
- Tidak memperluas izin tulis Google Forms; akses yang ditambahkan hanya baca respons.

## Tindakan setelah deployment
1. Buka SIPANDU → Google Workspace → Koneksi Akun.
2. Tekan **Pulihkan Izin Google API**.
3. Pilih akun Google Workspace pemilik sumber Form dan setujui permintaan izin baru.
4. Pastikan **Google Forms API** aktif pada Google Cloud project yang digunakan OAuth SIPANDU.
5. Jalankan ulang diagnostik Google Forms.

Versi aplikasi, halaman web, dan PWA diperbarui ke 5.0.2.
