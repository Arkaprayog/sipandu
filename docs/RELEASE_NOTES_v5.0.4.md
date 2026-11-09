# SIPANDU ODHIV — Catatan Rilis v5.0.4

Tanggal: 9 November 2026

## Migrasi Arsip Dokumen Petugas ke Google Drive privat
- Upload dokumen kini dikirim ke SIPANDU Assessment Archive Worker setelah sesi Firebase, role staf, dan identitas Google Workspace diverifikasi.
- Worker menyimpan file pada folder Drive SIPANDU/Dokumen, menandai kepemilikan dan kategori melalui appProperties, lalu membaca ulang metadata untuk memverifikasi MIME type, ukuran, folder, dan identitas file.
- Download dan penghapusan file melewati Worker dan pemeriksaan pemilik/role. Fitur Arsip Dokumen Petugas tidak lagi memakai Firebase Storage.
- Firestore hanya menyimpan metadata dan ID file privat. Tidak ada bearer download URL atau akses file publik.
- Batas ukuran file 25 MiB dan tipe file dibatasi pada PDF, DOC/DOCX, dan format gambar yang didukung.

## Penguatan pengujian akses
- Pengujian Firestore menguji metadata pointer Drive, penolakan metadata Storage lama, dan pembatasan perubahan metadata hanya oleh pemilik/administrator.
- Worker menguji upload, verifikasi, unduh, serta penolakan akses lintas pemilik.

## Batas infrastruktur yang tetap berlaku
- Firebase Storage tidak diaktifkan dan tidak memerlukan upgrade billing untuk jalur arsip dokumen petugas yang baru.
- Backup PDF asesmen terintegrasi tetap memakai Worker arsip yang sama dan Google Drive.
- Perlindungan branch main masih harus diaktifkan melalui pengaturan GitHub repository. Koneksi GitHub yang tersedia pada sesi ini hanya memberikan kemampuan membaca, bukan mengubah pengaturan proteksi branch.

## Nomor versi
Versi web, PWA, dan Android disinkronkan ke **5.0.4**.
