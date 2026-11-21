# SIPANDU 5.1.18

## Penguatan keamanan penugasan PPKS
- Batasi pembuatan riwayat layanan dan kunjungan pendamping berdasarkan dokumen penugasan otoritatif `ppksServiceStatus/{ppksId}`, bukan hanya UID yang dikirim klien.
- Pertahankan hak Owner/Supervisor untuk membuat dan mengatur catatan sesuai peran.
- Tambahkan tes regresi Firestore Rules untuk PPKS yang ditugaskan, tidak ditugaskan, dan ditugaskan kepada pendamping lain.

## Versi aplikasi
- Web / PWA / Android: **5.1.18**.
- Versi diselaraskan pada `package.json`, metadata `index.html`, dan `public/manifest.webmanifest`.

## Catatan verifikasi
- Pada commit aturan awal PR #269, Firebase Rules emulator meluluskan 14 tes dengan 0 kegagalan.
- GitHub Pages build, CodeQL, dan Android debug build berhasil; deployment Firestore Rules produksi dilewati.
- Perubahan ini belum mengubah Firestore Rules atau data produksi.
