# Perbaikan Google Sign-In Android (DEVELOPER_ERROR / [28444])

Dokumen ini menangani login Google native SIPANDU ODHIV tanpa mengubah tampilan halaman login.

## Konfigurasi aplikasi yang harus tetap cocok

- Firebase / Google Cloud project ID: `gen-lang-client-0197631978`
- Android package / application ID: `id.my.sipandu.odhiv`
- Web OAuth client ID yang saat ini digunakan kode (`firebase-applet-config.json`): `647774926620-p9bm17d7hhkt4k8r37hk1e5nmm0ibehd.apps.googleusercontent.com`

Nilai terakhir harus merupakan OAuth client bertipe **Web application** dari proyek Google Cloud yang sama. Kode native menggunakannya sebagai `webClientId`; jangan menggantinya dengan Android client ID.

## 1. Dapatkan fingerprint APK yang benar-benar dipasang

Untuk APK Release dari GitHub Actions, buka workflow run terbaru dan lihat bagian **Android Google Sign-In fingerprint** pada job summary. SHA-1 di sana diambil dari APK Release yang sudah ditandatangani oleh keystore persisten.

Untuk memeriksa file APK Release yang sudah diunduh secara lokal:

```sh
keytool -printcert -jarfile SIPANDU-ODHIV.apk
```

Gunakan SHA-1 dari sertifikat APK yang benar-benar dipasang di perangkat; jangan menganggap SHA-1 debug sama dengan release.

## 2. Daftarkan sertifikat pada Firebase dan Google Cloud

1. Buka [Firebase Console – Project settings](https://console.firebase.google.com/project/gen-lang-client-0197631978/settings/general).
2. Pada aplikasi Android dengan package `id.my.sipandu.odhiv`, bagian **SHA certificate fingerprints**, tambahkan SHA-1 yang tepat dari APK Release. Tambahkan SHA-256 juga bila tersedia.
3. Buka [Google Cloud Console – Credentials](https://console.cloud.google.com/apis/credentials?project=gen-lang-client-0197631978).
4. Pastikan ada OAuth client bertipe **Android** dengan package `id.my.sipandu.odhiv` dan SHA-1 yang sama persis. Buat client Android terpisah untuk setiap sertifikat berbeda, misalnya debug, release, atau Play App Signing.
5. Pastikan Web OAuth client ID di atas ada pada proyek yang sama dan kode menggunakan Web client ID tersebut, bukan Android client ID.
6. Di Firebase Console > Authentication > Sign-in method, pastikan penyedia Google diaktifkan.
7. Simpan perubahan, tunggu propagasi konfigurasi Google, lalu uji kembali menggunakan APK Release yang sama.

Jika APK didistribusikan melalui Google Play, tambahkan juga SHA-1 dari **Play App Signing certificate** di Play Console; fingerprint upload key saja tidak cukup.

## 3. Gunakan kunci Release yang persisten

APK release tidak boleh memakai keystore acak yang dibuat ulang di setiap build. Jika fingerprint berubah tiap build, Google OAuth client akan tidak cocok dan login native dapat gagal dengan `DEVELOPER_ERROR`.

Pada GitHub repository > Settings > Secrets and variables > Actions, siapkan empat secrets untuk keystore Release persisten:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Workflow juga mendukung alias `SIPANDU_RELEASE_KEYSTORE_BASE64`, `SIPANDU_RELEASE_STORE_PASSWORD`, `SIPANDU_RELEASE_KEY_ALIAS`, dan `SIPANDU_RELEASE_KEY_PASSWORD`. Jangan menaruh berkas keystore, kata sandi, token, atau service-account key di repository, log, atau chat.

Workflow release yang diperbarui menolak menerbitkan APK Release bila kunci persisten belum tersedia, dan menampilkan SHA-1 APK Release pada job summary. Ini mencegah pembuatan release baru yang terlihat sukses tetapi memakai fingerprint tidak stabil.

## Pemeriksaan setelah perubahan

- [ ] Package APK tetap `id.my.sipandu.odhiv`.
- [ ] Web OAuth client ID di kode adalah client tipe Web pada proyek yang sama.
- [ ] SHA-1 APK Release tepat sama dengan fingerprint pada Android OAuth client dan Firebase Android app.
- [ ] Google provider aktif pada Firebase Authentication.
- [ ] Login diuji pada perangkat dengan APK Release yang fingerprint-nya sudah didaftarkan.
- [ ] Firestore diuji secara terpisah; keberhasilan Google Sign-In tidak otomatis membuktikan Firestore Rules atau izin Drive/Sheets/Forms benar.

Kesalahan `[28444] Developer console is not set up correctly` biasanya menunjukkan ketidakcocokan package, sertifikat penandatangan, atau client ID. Mengubah CSS atau tampilan modal tidak memperbaiki konfigurasi OAuth tersebut.
