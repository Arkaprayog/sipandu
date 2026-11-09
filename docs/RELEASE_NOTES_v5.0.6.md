# SIPANDU ODHIV — Catatan Rilis v5.0.6

Tanggal: 9 November 2026

## Pembersihan metadata arsip lama
- Pemulihan dokumen lama menghapus field Firebase Storage `storagePath` dan `downloadUrl` setelah file baru terverifikasi tersimpan di Google Drive.
- Firestore Rules hanya mengizinkan penghapusan field warisan tersebut dan menolak penambahan kembali.
- Pengujian keamanan ditambahkan untuk memastikan migrasi metadata berhasil dan token URL lama tidak dapat diperkenalkan kembali.

## Ketahanan deployment Firestore Rules
- Workflow Firebase Rules tidak lagi membatalkan proses deployment aktif saat push baru terjadi pada branch yang sama.
- Perilaku ini mencegah race/cancellation pada tahap penerbitan Firestore Rules produksi.

## Nomor versi
Versi web, PWA, dan Android disinkronkan ke **5.0.6**.
