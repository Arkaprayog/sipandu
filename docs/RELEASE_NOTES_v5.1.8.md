# SIPANDU 5.1.8

## Pemulihan pendaftaran yang terputus

- Menambahkan tindakan **Lanjutkan pendaftaran lewat login** jika Firebase Authentication sudah membuat akun tetapi pembuatan profil, pencatatan Worker, atau pengiriman email verifikasi gagal.
- Meminta pengguna kembali memakai email dan kata sandi yang sama, bukan membuat akun duplikat.
- Mengandalkan jalur pemulihan login yang memeriksa status Worker, mencoba mencatat ulang pendaftaran mandiri yang hilang, mengirim ulang tautan verifikasi, dan mengaktifkan akun terverifikasi sebagai `anggota` setelah klaim server muncul.
- Menambahkan pengujian untuk kegagalan sesudah akun dibuat, email yang sudah terdaftar, dan kegagalan sebelum akun tercipta.
- Menyinkronkan versi aplikasi menjadi 5.1.8 pada metadata paket, HTML shell, dan PWA manifest.

## Batas yang tetap perlu verifikasi

- CI harus lulus untuk build web dan Android sebelum rilis dinyatakan siap.
- Izin Firebase IAM `firebaseauth.users.update` tetap harus dicek terhadap service account produksi; keberadaan secret Worker saja tidak membuktikan izin tersebut.
- Facial liveness server-side belum diaktifkan. Biometrik perangkat lokal atau foto selfie bukan bukti liveness; integrasi yang benar memerlukan provider, challenge anti-replay, persetujuan dan kebijakan pemrosesan/retensi biometrik, serta uji perangkat nyata.
