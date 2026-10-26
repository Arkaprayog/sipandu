# Audit Kesiapan Produksi SIPANDU ODHIV — v1.0.0

Tanggal audit: 2026-10-26  
Repository: `Arkaprayog/sipandu`  
Baseline kode: `a6c28ed35a052fb1aafa58045771453eb37a4cbf` (versi 0.0.30 sebelum hardening rilis mayor)

> **Kesimpulan:** perubahan pada versi 1.0.0 memperbaiki beberapa risiko performa, lifecycle, dan operasi destruktif. Namun, rilis ini **belum boleh dinyatakan production-ready untuk data responden/ODHIV nyata** sampai blocker privasi di bawah ditutup dan konfigurasi Firebase aktif diverifikasi. Build yang sukses bukan bukti bahwa keamanan database produksi atau sinkronisasi end-to-end sudah lulus.

## 1. Teknologi dan arsitektur yang diperiksa

- React 19 + TypeScript, Vite 8, Tailwind CSS 4.
- Firebase Authentication dan Cloud Firestore, dengan custom claim `role`.
- Google Forms/Sheets/Drive APIs melalui OAuth Workspace.
- Capacitor 7 untuk membangun aplikasi Android dari web build; GitHub Actions membuat debug APK memakai Java 21 dan Android SDK 35.
- Bun sebagai package manager dan test runner; GitHub Actions untuk tes, build, verifikasi aset, deployment Pages, dan APK.

Struktur penting:

- `src/App.tsx`: auth gate, state/cache PPKS, navigasi, live sync dan orkestrasi data.
- `src/components/LoginPage.tsx`, `Header.tsx`, `BottomNav.tsx`: login dan navigasi.
- `src/components/AsesmenView.tsx`, `DatabasePpksView.tsx`, `FromAsesmenTerintegrasiView.tsx`, `BerandaView.tsx`, `DokumenView.tsx`: alur fitur utama.
- `src/components/CameraCaptureModal.tsx`, `PrivateDriveImage.tsx`, `KemensosQRCode.tsx`: kamera, akses foto privat dan barcode.
- `src/lib/firebase.ts`, `googleWorkspace.ts`, `imageCompression.ts`, `formPhotoRecovery.ts`, `respondentNotifications.ts`: akses layanan, foto, kompresi, notifikasi.
- `firestore.rules`: aturan akses sumber kontrol versi; penerapan pada project/database Firebase aktif harus diverifikasi terpisah.
- `admin-tools/set-user-role.mjs`: utilitas Admin SDK yang harus dijalankan dari lingkungan administrator tepercaya.
- `scripts/optimize-login-background.mjs`, `scripts/verify-dist.mjs`: optimasi aset login dan pemeriksaan hasil build.
- `.github/workflows/`: pipeline Pages dan Android debug APK.

## 2. Perbaikan yang diterapkan pada v1.0.0

| Area | Perbaikan |
|---|---|
| Startup / memori | Parsing cache PPKS dan foto dipindahkan hingga sesi Firebase dinyatakan sah. Pada logout, data besar dibuang dari state aplikasi. |
| CPU / penyimpanan | Penulisan JSON ke localStorage di-debounce agar perubahan beruntun tidak melakukan serialisasi dan penulisan sinkron berkali-kali. |
| Race condition auth | Callback autentikasi sekarang memakai generation guard dan memeriksa UID sesi terbaru sebelum mengubah state. |
| Network startup | Live sync awal ditunda 1,5 detik agar dashboard sempat render; interval dan event listener dibersihkan saat effect unmount. |
| Operasi destruktif | Pembersihan baris/file contoh tidak lagi otomatis berjalan saat login. Sinkronisasi spreadsheet biasa juga tidak melakukan penghapusan/reconciliation Firestore. Penghapusan tetap tersedia sebagai tindakan manual pada Google Workspace & Cloud Hub. |
| Kamera | Semua track kamera dihentikan saat modal ditutup/unmount, termasuk kasus izin kamera selesai setelah modal ditutup. |
| Integritas data foto | Foto simulasi tidak lagi dapat disimpan sebagai foto responden jika kamera tidak aktif. Gunakan kamera nyata atau unggah berkas. |
| RAM / blob foto | URL objek foto Drive pada menu asesmen dicabut ketika komponen dilepas. |
| Test suite | `src/utils/helpers.test.ts` ditambahkan ke perintah tes agar tidak terlewat pada CI. |
| Versi native | Workflow Android mengatur `versionName` dan `versionCode` dari versi paket, serta memberi nama artefak debug berdasarkan versi. |
| Security automation | GitHub CodeQL ditambahkan untuk analisis statis JavaScript/TypeScript. |

## 3. Temuan keamanan dan release gates

### P0 — Penyimpanan lokal berisi PII/foto sensitif (blocker)

`src/App.tsx` menyimpan cache `sipandu_ppks` dan `sipandu_profile` ke localStorage. Record bisa memuat NIK, nomor telepon, status/asesmen dan data foto identitas/rumah; notifikasi responden juga disimpan di localStorage oleh `src/lib/respondentNotifications.ts`.

Konsekuensi:
- Data tidak dienkripsi oleh aplikasi dan dapat dibaca JavaScript yang berjalan pada origin yang sama.
- Cache bertahan setelah logout dan berada di perangkat/browser bersama.
- Cache tidak di-scope per UID pengguna; akun lain pada perangkat sama dapat membaca cache yang sama ketika masuk.
- Foto sebagai data URL dapat memperbesar serialisasi, penggunaan RAM, dan kuota browser.

Perubahan v1.0.0 menunda pembacaan cache sampai auth berhasil dan men-debounce penulisan, **tetapi tidak menghilangkan risiko penyimpanan plaintext**. Jangan gunakan data PPKS/ODHIV nyata pada perangkat/browser bersama sampai cache dimigrasikan ke model server-authoritative yang hanya membaca data setelah otorisasi Firestore tervalidasi dan cache perangkat memiliki kebijakan retensi/penghapusan yang sesuai. Jangan menghapus cache lama secara membabi buta: data yang belum tersinkron harus direkonsiliasi lebih dulu.

### P1 — Hak baca Firestore terlalu luas antarstaf

`firestore.rules` mengizinkan semua akun dengan custom claim `owner`, `supervisor`, atau `pendamping` membaca seluruh `/ppks/{recordId}`. Write/create/update/delete dibatasi ke owner/supervisor, ini baik sebagai baseline, tetapi prinsip least privilege untuk akses baca belum diterapkan per wilayah/penugasan/record.

Keputusan kebijakan akses perlu ditetapkan (siapa boleh melihat seluruh data sensitif vs responden yang ditugaskan). Setelah itu buat pengujian Firebase Emulator untuk semua role dan pastikan rules tersebut benar-benar diterapkan ke database ID yang digunakan aplikasi. File rules dalam repo tidak membuktikan rules produksi sudah sama.

### P1 — Kredensial klien Firebase dan lingkungan

`firebase-applet-config.json` berisi konfigurasi Firebase browser, termasuk Web API key. Web API key Firebase umumnya merupakan pengenal klien publik, **bukan** service-account secret; otorisasi tetap harus bergantung pada Auth dan Rules. Batasi API key dengan API restrictions dan referrer restriction yang tepat. Tidak ditemukan service-account private key atau client secret dalam file sumber yang dipindai pada audit ini, tetapi ini tidak menggantikan pemindaian riwayat Git dan konfigurasi Secrets di GitHub/Google Cloud.

Jangan pernah menyimpan `service-account.json`, refresh token OAuth, password, private key, atau rahasia server di repo atau bundle. Admin SDK hanya memakai Application Default Credentials dari lingkungan administrator tepercaya.

### P1 — Verifikasi integrasi produksi belum end-to-end

Build CI tidak mengakses token OAuth milik Anda sehingga belum memvalidasi izin aktual pada Google Form, spreadsheet dan folder Drive. Ia juga tidak membuktikan Firestore Rules yang deployed identik dengan file repo. Uji menggunakan akun dan data sintetis di lingkungan target sebelum membuka akses data nyata.

### P2 — Sinkronisasi dan ukuran payload

- Live sync membaca/menormalisasi seluruh roster sumber dan mungkin menggabungkan jawaban Form lanjutan. Frekuensi default 5 menit; ini wajar untuk roster kecil, tetapi perlu pagination/modified-since atau sinkronisasi incremental jika jumlah baris/foto tumbuh.
- Foto dikompresi sebelum cache; walau meringankan payload, base64/data URL tetap mahal saat diserialisasi dan memperbesar cache. Penyimpanan foto di Drive dengan hanya metadata/ID di dokumen data lebih scalable daripada menyimpan bytes di record.
- Browser notification polling tidak menjamin notifikasi saat aplikasi tertutup; hal itu memerlukan backend push yang terotorisasi (misalnya FCM sender tepercaya), bukan timer browser.

### P2 — Error handling dan observability

Beberapa alur penting sudah memiliki try/catch dan status UI. Masih perlu standardisasi error antar-API (permintaan dibatalkan, timeout, rate limit, koneksi putus), retry/backoff dengan batas, dan logging produksi yang tidak memuat PII/NIK/token. Jangan kirim object record lengkap ke console atau issue.

## 4. Uji fungsional / QA yang wajib sebelum rilis publik

### Auth dan role
- [ ] Login benar, password salah, akun nonaktif, jaringan putus dan timeout.
- [ ] User tanpa custom claim/role valid ditolak.
- [ ] Sign-out saat token claim masih diverifikasi tidak boleh mengembalikan user lama ke dashboard.
- [ ] Login akun A → logout → login akun B pada browser yang sama; pastikan tidak ada data/cache yang bocor antar akun.
- [ ] Owner, supervisor, dan pendamping diuji terhadap Firestore Rules aktual.

### Data dan integrasi
- [ ] Baca Forms/Sheets/Drive hanya dengan token OAuth yang valid dan akun yang tepat.
- [ ] Data sumber kosong/salah tab/kolom berubah/row duplikat/NIK notasi ilmiah ditangani dengan pesan yang jelas.
- [ ] Simpan perubahan data: cek hasil Firestore dan spreadsheet; simulasi satu target gagal dan pastikan UI tidak mengklaim sinkronisasi penuh.
- [ ] Sinkronisasi gagal/401/403/429/offline dan token kedaluwarsa tidak menyebabkan loop atau duplikasi.
- [ ] Verifikasi tidak ada penghapusan data cloud otomatis dari login atau sinkronisasi biasa.
- [ ] Foto asli, upload besar, format rusak, akses Drive 403, dan foto yang hilang diuji tanpa membuat foto placeholder.

### UX, performa dan native
- [ ] Cold start dan login di Android dengan jaringan cepat, 3G lambat, offline, cache kecil dan roster besar.
- [ ] Navigasi setiap tab dan modal pertama kali (lazy-loaded), termasuk kegagalan chunk dengan pesan yang dapat dipulihkan.
- [ ] Buka/tutup modal kamera berulang, izin ditolak, dan permission prompt ditutup; kamera harus berhenti dan indikator kamera hilang.
- [ ] Form asesmen: validasi NIK, simpan, kosongkan, ekspor/cetak, foto lampiran dan pemulihan setelah refresh.
- [ ] Barcode PNG dan tautan responden dapat dipindai/buka dari perangkat lain.
- [ ] Notifikasi saat tab aktif/background/ditutup; catat keterbatasan browser dan uji APK native secara terpisah.
- [ ] Instal APK debug v1.0.0; cek nama, versionName/versionCode, login, kamera, penyimpanan, orientasi, dan buka tautan eksternal.

## 5. Status rilis

- **Kualitas build:** menunggu workflow v1.0.0 lulus (tes, TypeScript lint, build dan verifikasi aset).
- **Native:** workflow akan membuat **debug APK** v1.0.0; ini bukan APK rilis bertanda tangan untuk Play Store.
- **Security:** **BELUM PRODUCTION-READY untuk data nyata** sampai blocker localStorage/retensi data dan hak baca Firestore ditangani, lalu konfigurasi aktif dan alur end-to-end diuji.
- **Cakupan audit:** static review kode dan pipeline repo. Ini bukan penetration test, audit IAM penuh, atau pemeriksaan konfigurasi live Firebase/Google/Vercel yang membutuhkan akses akun.
