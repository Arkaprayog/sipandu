# Kompatibilitas SIPANDU dengan Huawei HarmonyOS

## Jalur yang disarankan

Buka SIPANDU melalui Huawei Browser pada alamat aman:

https://sipanduodhiv.my.id

Apabila menu browser menyediakan pintasan, tambahkan situs SIPANDU ke layar utama. Gunakan ikon pintasan untuk membuka SIPANDU dan masuk dengan akun resmi.

## HarmonyOS sebelum versi 5 dan EMUI

Pada sebagian versi Huawei Browser, buka menu browser lalu gunakan opsi **Tambahkan ke → Desktop / Layar utama**. Nama menu dan ketersediaannya dapat berbeda menurut browser, versi sistem, dan wilayah.

## HarmonyOS 5 / HarmonyOS NEXT dan versi lebih baru

Buka menu Huawei Browser, lalu pilih **Tambahkan ke layar utama** atau **Buat pintasan** apabila tersedia. Pada sebagian perangkat, pintasan akan membuka halaman di browser dan bukan jendela PWA standalone. Akses melalui pintasan tetap menyediakan jalur penggunaan aplikasi web selama browser mendukung fitur web yang diperlukan.

## Batas paket Android dan aplikasi native Huawei

- APK Android SIPANDU ditujukan bagi perangkat Android dan perangkat Huawei lama yang masih menyediakan runtime Android yang sesuai.
- HarmonyOS NEXT tidak boleh diasumsikan menjalankan APK Android secara native. Kompatibilitas melalui lapisan pihak ketiga dapat berbeda dan tidak dijamin oleh rilis ini.
- Rilis v4.2.0 bukan paket native HarmonyOS / ArkTS / ArkUI dan bukan aplikasi yang diterbitkan melalui AppGallery.
- Paket native HarmonyOS membutuhkan pengembangan terpisah, signing, pengujian perangkat, dan jalur distribusi Huawei.

## Notifikasi, mode standalone, dan offline

SIPANDU memeriksa apakah browser mengekspos Service Worker, Notification API, dan mode standalone. Keberadaan API tidak menjamin notifikasi sistem atau mode instalasi didukung pada semua perangkat.

Notifikasi sistem hanya bekerja jika browser, OS, dan izin perangkat mendukungnya. Jika tidak, notifikasi di dalam SIPANDU menjadi jalur alternatif saat aplikasi dibuka dan tersambung ke cloud.

Service worker mengelola siklus hidup dan klik notifikasi. Data PPKS, NIK, foto identitas, dan dokumen pribadi tidak dimasukkan ke cache. Rilis ini tidak menjanjikan akses offline terhadap data cloud.

## Pengujian perangkat yang disarankan

Sebelum pemakaian operasional, uji pada perangkat fisik yang mewakili:
1. EMUI / HarmonyOS berbasis Android.
2. HarmonyOS 5 atau HarmonyOS NEXT.
3. Versi HarmonyOS dan Huawei Browser yang dipakai petugas.

Uji login, profil, foto dan dokumen privat, asesmen, sinkronisasi Google Workspace, navigasi kembali, pintasan layar utama, dan notifikasi. Catat model perangkat, versi OS, versi Huawei Browser, serta hasil tiap skenario.
