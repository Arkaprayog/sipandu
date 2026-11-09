# SIPANDU ODHIV — Catatan Rilis v5.0.8

Tanggal: 9 November 2026

## Penguatan privasi arsip dokumen petugas
- Metadata Firestore `staffDocuments` tidak lagi menyimpan tautan langsung Google Drive.
- Upload Worker mengembalikan ID file dan metadata verifikasi, tanpa `webViewLink`.
- Unduhan dokumen tetap melalui Worker yang memeriksa sesi Firebase, identitas Workspace, role, dan UID pemilik.
- Proses unggah ulang membersihkan tautan Drive lama bersama field legacy Firebase Storage; Firestore Rules mencegah field tersebut diperkenalkan kembali.
- Tes Worker dan Firestore memverifikasi bahwa link langsung tidak bocor melalui respons upload atau metadata Firestore.

## Nomor versi
Versi web, PWA, dan Android disinkronkan ke **5.0.8**.
