# SIPANDU 5.1.15

## Perbaikan Face Liveness
- Menyamakan masa berlaku challenge dengan batas sesi Amazon Rekognition Face Liveness, yaitu tiga menit sejak SessionId dibuat.
- Menolak challenge yang melebihi masa berlaku sesi AWS.
- Menampilkan hitung mundur dengan margin keselamatan 15 detik pada layar kamera dan menutup sesi yang habis agar pengguna dapat memulai ulang.
- Memperpanjang masa simpan bukti sekali pakai setelah pemeriksaan berhasil hingga masa berlaku bukti (10 menit), tanpa memperpanjang masa berlaku SessionId AWS.
- Menambahkan tes regresi untuk batas TTL challenge dan retensi bukti.

## Versi aplikasi
- Web / PWA / Android: **5.1.15**.
- Android versionCode dihitung otomatis oleh workflow native dari package.json.

## Batas verifikasi
Perubahan kode ini tidak memasang kredensial AWS di Worker produksi. Face Liveness tetap memerlukan tiga secret AWS yang sah, pengujian API AWS, dan pengujian kamera nyata setelah konfigurasi tersedia.
