# SIPANDU ODHIV — Catatan Rilis v5.0.9

Tanggal: 9 November 2026

## Pembatasan akses arsip dokumen berdasarkan role
- Firestore Rules membatasi Pendamping untuk membaca metadata arsip miliknya sendiri.
- Owner dan Supervisor tetap dapat membaca seluruh metadata arsip.
- Daftar dokumen Pendamping menggunakan filter UID di query Firestore, sehingga tidak meminta seluruh koleksi lalu menyaringnya di browser.
- Pengujian baru memastikan query milik Pendamping diterima, query tanpa filter ditolak, dan Supervisor dapat membaca arsip lintas pemilik.

## Nomor versi
Versi web, PWA, dan Android disinkronkan ke **5.0.9**.
