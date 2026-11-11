# SIPANDU ODHIV 5.0.13

Tanggal: 11 November 2026

## Perbaikan Database PPKS
- Mengaktifkan pemetaan kolom ATENSI berdasarkan tab sumber `From Responses 1`, sehingga kolom K tetap menjadi Alamat Domisili Saat Ini dan kolom AO menjadi Lama Terapi ARV meskipun spreadsheet dibuat ulang dan ID spreadsheet berubah.
- Mempertahankan nilai Alamat Domisili dan Lama Terapi ARV yang sudah terisi ketika baris responden digabungkan saat deduplikasi.
- Menambahkan pengujian eksplisit untuk pembacaan kolom K/AO dan retensi nilai saat deduplikasi.

## Versi
- Web/PWA dan metadata Android: 5.0.13.
- Build APK debug/release tetap mengikuti proses workflow Android; status artefak dan penandatanganan harus diverifikasi pada hasil Actions.
