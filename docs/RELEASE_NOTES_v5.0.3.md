# SIPANDU ODHIV — Catatan Rilis v5.0.3

Tanggal: 9 November 2026

## Hardening validasi Form Asesmen Terintegrasi
- Aturan Firestore membatasi map jawaban pada 91 field pertanyaan resmi dan lima field metadata yang digunakan formulir.
- Validasi yang sama berlaku pada penyimpanan jawaban di dokumen PPKS dan koleksi jawaban asesmen terpisah.
- Pengujian negatif ditambahkan untuk menolak key di luar skema, sekaligus memastikan jawaban pilihan jamak tetap diterima.

## Perbaikan deployment Worker arsip
- Workflow deployment Worker arsip kini mengikuti perubahan di branch `main`, bukan branch perbaikan sementara.
- Job deployment dibatasi ke `main` agar branch lain tidak dapat menerbitkan Worker produksi.

## Konsistensi metadata rilis
- Metadata `application-version` di `index.html` disamakan dengan `package.json` agar verifikasi build web, Cloudflare Worker, dan APK memakai versi yang sama.

## Nomor versi
Versi aplikasi web, PWA, dan paket Android dinaikkan ke **5.0.3**.
