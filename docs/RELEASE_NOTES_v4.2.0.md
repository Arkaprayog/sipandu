# SIPANDU ODHIV v4.2.0

Tanggal pembaruan: 8 November 2026

## Ringkasan

Rilis minor v4.2.0 melanjutkan v4.1.0. Rilis ini memperkuat pemeriksaan kualitas data dan akses PWA pada perangkat Huawei tanpa mengubah roster sumber atau model penyimpanan layanan.

## Pembaruan

- Data Quality Center bersifat read-only dan menilai kelengkapan bidang dasar, potensi NIK duplikat, usia, wilayah, kontak, dan foto identitas.
- Potensi duplikasi hanya ditandai untuk verifikasi manusia; tidak ada data otomatis yang diubah, digabung, atau dihapus.
- Pengaturan menyediakan panduan penggunaan PWA melalui Huawei Browser serta pemeriksaan kemampuan browser.
- Service worker didaftarkan lebih awal pada secure context yang mendukung, dan lifecycle update mengaktifkan worker baru secara terkontrol.
- Service worker tidak menyimpan roster, NIK, foto KTP/KK, atau dokumen pribadi ke cache; rilis ini tidak mengklaim operasi offline untuk data cloud.
- Metadata PWA mendukung orientasi layar apa pun dan deklarasi mobile web app; logo resmi yang telah ada tetap dipakai.
- Pemeriksaan build memastikan versi package, HTML, manifest, dan Android build konsisten.

## Versi platform

- PWA Android: 4.2.0
- PWA iOS: 4.2.0 (manifest web bersama)
- Android Debug APK: 4.2.0 / versionCode 40200
- Android Release APK: 4.2.0 / versionCode 40200
- Huawei HarmonyOS: jalur PWA melalui Huawei Browser; APK Android bukan paket native HarmonyOS.

## Batas kompatibilitas Huawei

Dukungan pintasan layar utama, tampilan standalone, dan notifikasi sistem dapat berbeda menurut versi HarmonyOS, Huawei Browser, wilayah, serta izin sistem. HarmonyOS NEXT tidak boleh diasumsikan menjalankan APK Android secara native. Lihat `docs/HARMONYOS_COMPATIBILITY.md`.
