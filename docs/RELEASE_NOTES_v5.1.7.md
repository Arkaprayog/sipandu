# SIPANDU 5.1.7

## Perbaikan GitHub Actions dan diagnostik aktivasi

- Memperbaiki pesan diagnostik pada Worker pendaftaran agar secara eksplisit menyebut izin IAM `firebaseauth.users.update` ketika izin tersebut tidak diberikan kepada service account.
- Menyamakan pesan Worker dengan kontrak pengujian regresi sehingga workflow Pages dan Android tidak berhenti pada satu assertion yang gagal.
- Menaikkan versi aplikasi menjadi 5.1.7 pada metadata paket, HTML shell, dan PWA manifest. Versi Android diturunkan otomatis dari `package.json` oleh workflow build.

## Validasi

- Menjalankan ulang tes aplikasi dan memeriksa bahwa diagnostik IAM tetap fail-closed.
- GitHub Actions Pages, Android APK, CodeQL, dan Firebase Rules harus lulus sebelum perubahan digabung dan deployment dianggap berhasil.

## Batas

Perubahan ini memperbaiki kegagalan tes CI. Perubahan ini tidak memberikan izin IAM Google secara otomatis dan tidak mengubah klaim atau akun Firebase produksi.
