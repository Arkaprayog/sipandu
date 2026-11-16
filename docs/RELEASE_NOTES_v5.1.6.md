# SIPANDU 5.1.6 — Diagnostik Aktivasi Firebase

## Perbaikan
- Saat aktivasi anggota gagal, aplikasi menjalankan pemeriksaan diagnostik melalui Worker pendaftaran sebelum menampilkan pesan pemulihan.
- Worker memeriksa status verifikasi email dan akun Firebase, ketersediaan konfigurasi, serta izin `firebaseauth.users.update` milik service account menggunakan Cloud Resource Manager `projects.testIamPermissions`.
- Pemeriksaan IAM tidak mengubah custom claims, profil, atau status akun pengguna.
- Pesan kegagalan kini membedakan izin IAM yang terbukti tidak tersedia, konfigurasi Worker yang hilang, dan pemeriksaan IAM yang belum dapat dipastikan.
- Pengguna tidak diminta membuat akun baru hanya karena penerbitan peran gagal.

## Validasi
- Menambahkan pengujian Worker untuk permission tersedia dan permission tidak tersedia.
- Menambahkan pengujian klien untuk pemeriksaan IAM otomatis dan kondisi hasil diagnostik yang belum konklusif.
- Versi aplikasi disinkronkan ke 5.1.6 pada package metadata, HTML shell, dan PWA manifest.

## Batas yang belum ditutup
- Pemeriksaan IAM otomatis belum membuktikan bahwa aktivasi akun produksi berhasil; uji login/aktivasi nyata tetap diperlukan.
- Verifikasi wajah facial liveness belum terintegrasi pada alur pendaftaran produksi. Biometrik perangkat lokal dan selfie biasa bukan liveness. Integrasi liveness memerlukan provider/backend, kredensial server, pengujian anti-replay, serta persetujuan lokasi pemrosesan dan retensi data biometrik sebelum diaktifkan.
