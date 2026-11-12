# SIPANDU ODHIV 5.1.1

Tanggal: 12 November 2026

## Pemeliharaan rilis
- Menyinkronkan versi aplikasi pada package.json, HTML shell, dan PWA manifest.
- Menjaga metadata versi Android tetap diturunkan dari package.json oleh workflow build native, termasuk versionName dan versionCode.
- Memastikan pemeriksaan build menolak artefak dengan metadata versi yang tidak konsisten.

## Validasi dan batas rilis
- Rilis ini harus melewati pengujian aplikasi, pemeriksaan TypeScript, build web, verifikasi PWA, build APK debug, dan validasi workflow release.
- Perubahan versi ini tidak mengubah skema Firestore, data responden, konfigurasi OAuth, maupun rahasia deployment.
- Keberhasilan CI/deployment tidak menggantikan uji end-to-end pada akun dan layanan Firebase/Google Workspace produksi.

## Versi
- Web/PWA: 5.1.1.
- Android versionName: 5.1.1.
- Android versionCode: 50101 (dihasilkan otomatis dari package.json).
