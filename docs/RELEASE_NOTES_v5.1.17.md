# SIPANDU 5.1.17

## Perbaikan PDF Asesmen Terintegrasi
- Jawaban panjang yang memenuhi lebih dari satu halaman A4 sekarang dapat dilanjutkan pada batas baris teks terukur, bukan ditolak hanya karena satu baris tabel lebih tinggi dari satu halaman.
- PWA dan iOS menggunakan PDF kanonis yang sama dengan dokumen unduhan/arsip untuk jalur cetak utama. Android tetap mencetak berkas PDF yang sama setelah disimpan ke penyimpanan privat aplikasi.
- Jalur cetak berbasis Base64 diberi batas aman 4 MiB. Dokumen lebih besar atau kegagalan jalur tersebut dialihkan ke fallback halaman A4 WebView agar tidak membebani memori perangkat.

## Versi aplikasi
- Web / PWA / Android: **5.1.17**.
- Versi diselaraskan pada `package.json`, metadata `index.html`, dan `public/manifest.webmanifest`.

## Catatan verifikasi
- Tes regresi ditambahkan untuk skenario satu jawaban yang melampaui satu halaman A4.
- Hasil GitHub Actions pada PR dan pemeriksaan build harus lulus sebelum perubahan digabung dan dirilis.
- Pengujian printer/perangkat nyata dan validasi visual formulir resmi tetap diperlukan setelah deployment.
