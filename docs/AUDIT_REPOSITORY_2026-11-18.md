# Audit repositori SIPANDU — 18 November 2026

## Ringkasan eksekutif

Repositori GitHub yang dapat diakses dalam sesi ini hanya satu: Arkaprayog/sipandu. Repositori bersifat public, branch utama main, dan koneksi GitHub memiliki izin tulis/admin. Audit ini merupakan inspeksi statis terarah pada alur autentikasi/pendaftaran, role dasar, Firestore Rules, Face Liveness, PDF/arsip asesmen, dan workflow CI/CD. Ini bukan audit keamanan formal, bukan pemeriksaan setiap baris dari seluruh modul aplikasi, dan bukan pengujian penetrasi.

Versi sumber main saat audit: 5.1.16.
Commit main yang diperiksa: 04dca712db03eca216f1fffda02d1b167da8c48c.

## Perbaikan yang telah digabung sebelum laporan ini

- PR #264 dan #265 menyamakan masa berlaku challenge Worker dengan batas sesi Rekognition Face Liveness tiga menit. Setelah liveness lolos, record bukti sekali pakai disimpan sampai masa berlaku proof-nya sendiri, tanpa memperpanjang SessionId AWS.
- PR #265 menambahkan hitung mundur dengan margin 15 detik di UI kamera dan memungkinkan pengguna memulai sesi baru saat sesi kedaluwarsa.
- PR #266 menambahkan validasi di klien: expiresInSeconds harus angka positif, finite, dan tidak lebih dari 180 detik; respons 0/600 detik ditolak.
- Versi Web/PWA diselaraskan pada 5.1.16 di package.json, index.html, dan manifest PWA.
- PR CI untuk #265 dan #266 menjalankan Firebase Rules emulator, CodeQL, Pages build, dan Android build dengan hasil sukses. Catatan: pada event pull_request, langkah produksi deploy Pages dan publish signed APK dilewati sebagaimana mestinya; keberhasilan PR build tidak sama dengan bukti rilis produksi.

## Status layanan Cloudflare yang diperiksa

Snapshot Cloudflare account 0f751dca493cdf222b4c7cd084647f67 pada 18 November 2026:

| Worker | Deployment terbaru yang terlihat | Status binding/secret |
|---|---|---|
| sipandu | 2026-11-18 15:40:20 UTC, 100% traffic | Static assets; tidak memerlukan secret/binding untuk konfigurasi saat ini |
| sipandu-assessment-archive | 2026-11-18 15:38:16 UTC, 100% traffic | FIREBASE_AUTH_API_KEY, FIREBASE_PROJECT_ID, GOOGLE_WORKSPACE_EMAIL tersedia sebagai plain text; token Google OAuth berasal dari sesi pengguna |
| sipandu-registration | 2026-11-18 15:30:53 UTC, 100% traffic | Firebase/Turnstile secrets, PENDING_REGISTRATIONS KV, dan LIVENESS_CHALLENGES Durable Object tersedia |

Durable Object LIVENESS_CHALLENGES terikat pada namespace 842c5859cc604ef18de5527dd5471397 dengan kelas LivenessChallengeStore. KV PENDING_REGISTRATIONS terikat pada namespace 49fbf170f6f6410f9ae787a7cc63ffb9.

### P1 — Face Liveness produksi belum aktif

Pada Worker sipandu-registration, secret AWS berikut belum ada:
- AWS_ACCESS_KEY_ID
- AWS_SECRET_ACCESS_KEY
- AWS_FACE_LIVENESS_ROLE_ARN

Artinya backend dan UI Face Liveness sudah ada, dan Durable Object sudah dipasang, tetapi layanan tidak siap untuk membuat sesi AWS. Tidak ada nilai dummy yang dipasang dan tidak ada secret yang dibaca atau dimasukkan ke repo. Aktivasi memerlukan akun AWS yang berwenang untuk membuat kredensial IAM terbatas, mengaktifkan region yang dipakai, lalu memasang secret melalui kanal Cloudflare yang aman. Setelah itu wajib dilakukan health check, uji API Rekognition/STS, dan uji kamera nyata pada browser/Android. Issue #259 tetap terbuka sebagai pekerjaan konfigurasi eksternal; bagian Durable Object pada deskripsi awal issue sudah tidak sesuai dengan snapshot terbaru dan perlu diperbarui.

## Area yang diperiksa

### 1. Pendaftaran dan role anggota

Kode RegistrationPage membuat identitas Firebase dan profil dasar sebelum memulai Face Liveness. Setelah proof liveness sah, Worker /register menulis catatan pending_email ke KV dan aplikasi mengirim email verifikasi. Setelah email diverifikasi, Worker /activate mengeluarkan role anggota hanya untuk UID/email yang cocok dan akun yang tidak dinonaktifkan.

Login juga menyediakan pemulihan untuk akun yang identitas Firebase-nya sudah dibuat tetapi pendaftaran Worker belum selesai. Pengguna diarahkan melanjutkan dengan akun yang sama; bukan membuat akun duplikat.

### 2. Pembatasan role dan data

Firestore Rules mendefinisikan isStaff sebagai owner, supervisor, dan pendamping; role anggota tidak termasuk. PPKS dan koleksi operasional staf tetap dibatasi. Tes Firebase Rules yang ada mencakup penolakan akses anggota ke PPKS, jawaban/arsip asesmen, intake responden, dokumen dan surat staf, status/riwayat layanan, kunjungan, Direct Message, dan Firebase Storage staf; anggota hanya dapat mengelola profil UID sendiri dan tidak dapat menulis role pada profil.

Worker arsip Google Drive juga membatasi endpoint arsip untuk role staf dan mengikat token OAuth Google ke akun Workspace yang ditetapkan. Issue #230 tentang role anggota dasar telah dipenuhi oleh implementasi dan tes tersebut; deskripsi issue lama perlu ditutup/diperbarui agar tidak menggambarkan alur pendaftaran yang sudah diganti.

### 3. Arsip Google Drive

Worker sipandu-assessment-archive memeriksa Firebase ID token dan custom role, memeriksa identitas Google melalui OAuth userinfo, mengunggah PDF ke folder My Drive yang dikelola SIPANDU, kemudian membaca metadata/file kembali untuk verifikasi MIME type, ukuran, folder, dan marker arsip. Worker memakai token Google jangka pendek dari sesi Workspace; tidak ditemukan service-account key Google pada binding/secret Worker ini. Endpoint /health menyatakan konfigurasi tersedia, tetapi folder Drive dan hak akses nyata baru diverifikasi pada transaksi arsip yang terautentikasi.

Keterbatasan yang tersisa: mekanisme retry tiga kali berjalan dalam request, belum ada durable background retry queue/outbox. Kegagalan sementara setelah request berhenti tetap memerlukan pengulangan manual dari aplikasi.

### 4. PDF Form Asesmen Terintegrasi — P1 masih terbuka

Kode saat ini membangun enam halaman formulir dari struktur DOM/HTML dan merasterisasinya menggunakan html2canvas lalu membuat PDF baru dengan pdf-lib. Saya tidak menemukan pemanggilan yang memuat PDF formulir sumber melalui PDFDocument.load pada alur generator ini. Dengan demikian, implementasi sekarang belum membuktikan bahwa enam halaman asli digunakan sebagai background PDF yang identik secara piksel/struktur.

Empat halaman lampiran foto direncanakan setelah enam halaman formulir. Namun, ketika sebuah baris jawaban lebih tinggi daripada area aman satu A4, fungsi splitAssessmentPageAtRows saat ini melempar error yang meminta pengguna meringkas jawaban. Artinya kasus jawaban tunggal yang melebihi satu halaman belum ditangani otomatis. Jalur cetak WebView juga merender DOM, sedangkan simpan/arsip membuat Blob PDF melalui generator; byte PDF yang dicetak dan diarsipkan belum dijamin selalu identik untuk semua jalur platform.

Issue #258 merekam kriteria penerimaan PDF yang masih terbuka. Pekerjaan ini memerlukan file PDF sumber resmi enam halaman untuk dijadikan dasar, uji visual/hasil cetak dengan jawaban panjang, penanganan satu baris yang melebihi satu halaman, dan uji kesamaan hasil simpan/arsip/unduh/cetak. Jangan mengganti logo/kop resmi dengan gambar buatan ulang atau gambar AI.

### 5. CI/CD dan pengamanan branch

Workflow utama yang diperiksa:
- Pages: tes aplikasi, TypeScript, validasi worker bundle/aset, build, dan deploy Pages pada push main.
- Cloudflare app Worker: tes, lint, build, validasi aset dan deploy Worker sipandu.
- Registration Worker: bundle, tes keamanan Worker, lalu deploy Worker.
- Assessment archive Worker: tes, lint, deploy, dan pemeriksaan /health.
- Firebase Rules: emulator tests; deployment Firestore Rules dipisah dan hanya saat Rules/config berubah atau manual dispatch disetujui.
- Native Android: application tests, TypeScript, web build, Gradle debug/release verification, dan release publication pada jalur push main.
- CodeQL: analisis JavaScript/TypeScript.

Run PR #265 dan #266 pada Pages build, Firebase Rules emulator, CodeQL, dan Android build berhasil. Pada event pull_request, deploy Pages dan publish signed APK dilewati. Snapshot Cloudflare menunjukkan Worker sipandu dan assessment archive mendapat deployment setelah PR #266 digabung; registration Worker mendapat deployment setelah perubahan backend #264/#265. Status artefak APK bertanda tangan/rilis Android 5.1.16 dan status deployment GitHub Pages pada push main tidak diverifikasi secara independen melalui daftar workflow run push dalam konektor audit ini; jangan menyamakan status PR CI dengan rilis signed APK.

Issue #231 melaporkan branch main belum dilindungi oleh branch protection/ruleset wajib. Konektor GitHub yang tersedia dalam sesi ini tidak menyediakan operasi untuk membaca/mengubah branch protection atau ruleset. Owner repo perlu memeriksa GitHub Settings → Branches/Rulesets dan mewajibkan PR serta check stabil yang sudah diverifikasi, melarang force push/hapus branch, dan mengatur bypass hanya untuk admin tepercaya.

## Tindak lanjut yang masih diperlukan

1. Pasang tiga secret AWS Face Liveness melalui akun AWS/Cloudflare yang berwenang; lalu lakukan pengujian Rekognition, STS, kamera, pendaftaran, dan login nyata.
2. Selesaikan issue #258: gunakan PDF sumber resmi dan samakan byte output untuk simpan/arsip/unduh/cetak; tambahkan uji visual dengan jawaban yang melampaui satu halaman.
3. Owner memeriksa dan mengaktifkan branch protection/ruleset pada main (issue #231).
4. Uji end-to-end pada perangkat Android/browser, email verifikasi, akun Google Workspace, akses Drive, dan alur cetak dengan data sintetis.

## Batas audit

- Hanya satu repositori GitHub yang terlihat oleh koneksi ini, yaitu Arkaprayog/sipandu.
- Audit kode bersifat statis dan terarah; bukan baris-per-baris semua modul atau penetration test.
- Snapshot Cloudflare membuktikan nama binding/secret dan persentase deployment, bukan isi atau validitas secret.
- Tidak dilakukan perubahan pada data responden, Firebase production data, IAM AWS, maupun nilai secret.
- Pengujian kamera fisik, penerimaan email real, hak akses Drive end-user, dan hasil printer perangkat nyata belum dilakukan.
