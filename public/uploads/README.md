# Folder Upload Foto, Logo, dan PDF

Folder ini menyimpan aset gambar, logo, dan dokumen yang dipakai aplikasi SIPANDU ODHIV.

## Pemetaan aset logo

- `sipandu-logo.png`: sumber resmi ikon aplikasi PWA, favicon, iOS, dan launcher Android.
- `Logo Kemensos Hadir.png`: logo yang ditampilkan pada halaman login.
- `logo-kemsos.webp`: logo Kemensos yang ditanam di tengah QR/barcode asesmen.
- `Logo Kemensos.png` dan `ATENSI HD.png`: dua logo asli pada kop Form Asesmen Terintegrasi.

Generator ikon aplikasi berada di `scripts/generate_pwa_icons.py` dan `scripts/generate_android_icons.py`; keduanya mengambil `sipandu-logo.png` tanpa mengganti artwork. Pertahankan nama/case file persis karena dipakai pada source code. Tidak boleh memakai gambar buatan AI atau mengambil logo dari internet.

Setelah perubahan kode, pastikan GitHub Actions build/test, pemeriksaan `node scripts/verify-dist.mjs`, dan deployment yang terhubung berhasil.

## Panduan keamanan

- Gunakan nama file yang jelas, huruf kecil, dan tanda hubung bila diperlukan.
- Pastikan aset memang boleh dipublikasikan sebelum diletakkan di folder `public`.
- Jangan unggah data pribadi responden, KTP, KK, foto wajah, atau dokumen sensitif ke folder ini karena konten di `public` dapat diakses publik.
- File di folder ini dapat diakses melalui URL `/uploads/nama-file` setelah perubahan masuk ke deployment.
