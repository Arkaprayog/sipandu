# Folder Upload Foto, Logo, dan PDF

Folder ini menyimpan aset gambar, logo, dan dokumen yang dipakai aplikasi SIPANDU ODHIV.

## Aset logo aplikasi

- Sumber logo aktif untuk ikon PWA/iOS dan ikon peluncur Android: `sipandu-logo.png`.
- Generator ikon ada di `scripts/generate_pwa_icons.py` dan `scripts/generate_android_icons.py`.
- Jangan hapus atau mengganti nama aset yang dirujuk generator kecuali kedua generator dan pemeriksaan build juga diperbarui.
- Setelah perubahan aset atau dependency, pastikan GitHub Actions serta Cloudflare Workers Builds selesai tanpa error.

## Panduan keamanan

- Gunakan nama file yang jelas, huruf kecil, dan tanda hubung bila diperlukan.
- Pastikan aset memang boleh dipublikasikan sebelum diletakkan di folder `public`.
- Jangan unggah data pribadi responden, KTP, KK, foto wajah, atau dokumen sensitif ke folder ini karena konten di `public` dapat diakses publik.
- File di folder ini dapat diakses melalui URL `/uploads/nama-file` setelah perubahan masuk ke deployment.
