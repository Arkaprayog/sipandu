# SIPANDU ODHIV 5.0.11

Tanggal: 10 November 2026

## Perbaikan Database PPKS
- Menetapkan tab Google Spreadsheet `From Responses 1` sebagai sumber profil PPKS.
- Memetakan kolom sumber sesuai ketentuan: Nama Lengkap (C), NIK KTP (D), Usia (L), Jenis Kelamin (M), Alamat (K), Kota (I), Lama Terapi ARV (AO), Jenis Bantuan (AM), Desil (AQ), No HP/WA (N), serta Rekomendasi & Intervensi Tingkat Lanjut (AP).
- Menampilkan field profil dalam urutan yang sama dengan daftar sumber; Timestamp tidak ditampilkan sebagai baris profil.
- Menghilangkan kontrol edit lokal untuk field yang dimiliki spreadsheet agar data lokal tidak menimpa nilai sumber. Pembaruan profil mengikuti proses live sync.
- Memastikan Jenis Kelamin dan Lama Terapi ARV ikut dibawa ke model data, rekonsiliasi roster, dan penyimpanan Firestore.

## Perbaikan CI / GitHub Actions
- Memperbaiki kegagalan TypeScript `TS2741` pada `DatabasePpksView`: komponen masih mewajibkan prop `onUpdatePPKS` sementara pemanggil sudah menggunakan tampilan berbasis spreadsheet.
- Menjalankan ulang pemeriksaan melalui pull request untuk unit tests, TypeScript, build web/PWA, dan build Android.

## Versi seluruh platform
- Web / PWA Android: 5.0.11
- PWA iOS: 5.0.11
- PWA Huawei HarmonyOS: 5.0.11 (menggunakan jalur PWA; bukan paket native HarmonyOS/ArkTS)
- Android Debug APK: 5.0.11 (versionCode 50011)
- Android Release APK: 5.0.11 (versionCode 50011)

Android APK workflows mengambil `versionName` dan `versionCode` dari versi `package.json`, kemudian memeriksa metadata APK hasil build. Rilis APK bertanda tangan tetap memerlukan keystore dan GitHub Actions secrets yang sudah dikonfigurasi.
