# SIPANDU ODHIV — Catatan Rilis v5.0.7

Tanggal: 9 November 2026

## Ketahanan build Android
- Workflow Android private release dan native APK kini memakai distribusi Gradle `bin.zip` yang lebih kecil, bukan paket `all.zip` yang berukuran lebih besar.
- Timeout unduhan Gradle Wrapper dinaikkan menjadi 120 detik untuk mengurangi kegagalan unduh pada jaringan runner yang lambat.
- Script konfigurasi memvalidasi file wrapper yang dihasilkan Capacitor sebelum build; build tetap gagal tertutup bila konfigurasi wrapper tidak sesuai.

## Nomor versi
Versi web, PWA, dan Android disinkronkan ke **5.0.7**.
