# SIPANDU — Pendaftaran Mandiri, Face Liveness, dan Aktivasi Anggota

Dokumen ini menjelaskan alur yang diterapkan pada main saat ini. Pendaftaran terbuka tidak memerlukan kode tim atau undangan Owner. Face Liveness diwajibkan untuk pendaftaran baru; pemeriksaan tambahan saat login bersifat opsional.

## Alur pendaftaran pengguna baru

1. Pengguna mengisi nama, email aktif, dan kata sandi. Firebase Authentication membuat identitas akun dan SIPANDU membuat profil dasar pada userProfiles/{uid}.
2. Setelah identitas Firebase tersedia, pengguna menyetujui pemrosesan kamera dan menyelesaikan Face Liveness. Worker membuat challenge yang terikat pada Firebase UID dan tujuan registration; bukti hasilnya bersifat sekali pakai.
3. Setelah bukti liveness berhasil, aplikasi mengirim POST /register. Worker memverifikasi Firebase ID token, akun belum terverifikasi/tidak dinonaktifkan, ketiadaan role yang telah ada, serta bukti liveness yang terikat pada UID. Worker baru kemudian mencatat status pending_email pada KV.
4. Aplikasi mengirim tautan verifikasi melalui Firebase Authentication dan mengakhiri sesi pendaftaran. Jika jaringan terputus setelah akun Firebase dibuat, pengguna harus melanjutkan dengan email dan kata sandi yang sama, bukan membuat akun kedua.
5. Pengguna membuka tautan verifikasi email lalu masuk kembali. Halaman login memuat ulang status akun dan token Firebase.
6. Jika email sudah terverifikasi tetapi role belum diterbitkan, aplikasi memanggil Worker POST /activate. Worker mencocokkan UID/email dengan catatan KV, memeriksa status akun, lalu menetapkan custom claim role=anggota melalui Firebase Admin API.
7. Aplikasi menyegarkan ID token dan memastikan klaim anggota tersedia. Anggota mendapat layar dasar yang terisolasi; akses operasional/staf tetap memerlukan pemberian role oleh administrator.

## Pemulihan akun dan login

- Jika identitas Firebase sudah dibuat tetapi catatan pendaftaran belum selesai, login menampilkan alur pemulihan liveness. Endpoint /register tetap memerlukan bukti baru yang terikat pada UID, kecuali catatan pending_email self-service yang sudah ada dapat dipulihkan secara idempoten.
- Jika profil Firestore belum dibuat karena proses sebelumnya terputus, login memeriksa profil dan membuat profil dasar hanya bila dokumen belum ada.
- Anggota yang emailnya belum terverifikasi tidak memperoleh akses aplikasi; sistem mengirim ulang tautan verifikasi dan mengakhiri sesi.
- Setelah login berhasil, Face Liveness tambahan dapat dipilih sebagai lapisan keamanan opsional. Pengguna dapat melewatinya. Pilihan ini bukan pengganti autentikasi Firebase atau pembatasan role di server.
- Biometrik perangkat (sidik jari/Face ID yang membuka kunci lokal) berbeda dari Face Liveness server-side. Biometrik perangkat tidak membuktikan bahwa wajah pengguna hidup dan tidak menggantikan challenge Rekognition.

## Batas hak akses

- Pendaftar baru hanya memperoleh role anggota; role tidak pernah dipilih dari browser.
- owner, supervisor, dan pendamping yang sudah ada tidak ditimpa oleh jalur pendaftaran anggota.
- Firebase Firestore/Storage Rules tidak memasukkan anggota ke fungsi isStaff(). Tes emulator memastikan anggota ditolak pada koleksi PPKS, jawaban/arsip asesmen, intake responden, dokumen/surat staf, status/riwayat layanan, kunjungan, Direct Message, dan file Storage staf.
- Anggota hanya dapat membaca/mengelola profil userProfiles/{uid} miliknya sendiri; anggota tidak dapat menetapkan field role pada profil.
- Worker arsip Google Drive hanya mengizinkan role staf owner, supervisor, dan pendamping. Worker menolak anggota.

## Konfigurasi Worker pendaftaran

Worker sipandu-registration memerlukan konfigurasi inti berikut:
- Secret FIREBASE_AUTH_API_KEY
- Secret FIREBASE_SERVICE_ACCOUNT_JSON dengan izin minimum untuk memperbarui custom claims Firebase Authentication (firebaseauth.users.update)
- Secret TURNSTILE_SECRET_KEY untuk formulir publik
- Variabel proyek Firebase, KV PENDING_REGISTRATIONS, dan Durable Object LIVENESS_CHALLENGES (kelas LivenessChallengeStore)

Face Liveness memerlukan tambahan tiga secret AWS:
- AWS_ACCESS_KEY_ID
- AWS_SECRET_ACCESS_KEY
- AWS_FACE_LIVENESS_ROLE_ARN

Ketiga secret AWS tersebut belum terpasang pada Worker produksi pada pemeriksaan 18 November 2026. Karena itu, kode/endpoint Face Liveness sudah ada, tetapi Face Liveness produksi belum siap sampai kredensial AWS yang sah dipasang. Jangan mengisi nilai dummy dan jangan menaruh nilai secret di repo, issue, log, atau percakapan.

Periksa GET /health dan GET /liveness/health. Health check liveness yang ready=true hanya menunjukkan konfigurasi tersedia; itu belum membuktikan AWS IAM, Rekognition API, kamera, ataupun streaming benar-benar berhasil. Uji kamera pada browser dan perangkat Android nyata tetap diperlukan.

## Alur Face Liveness dan masa berlaku

- Rekognition Face Liveness SessionId mempunyai batas masa berlaku tiga menit; Worker membatasi challenge hingga 180 detik dengan toleransi jam kecil.
- Antarmuka menampilkan hitung mundur dan menghentikan sesi sebelum batas waktu AWS, sehingga pengguna dapat memulai sesi baru bila sesi habis.
- Setelah hasil liveness berhasil, bukti sekali pakai mempunyai masa berlaku tersendiri hingga sepuluh menit. Masa berlaku bukti ini tidak memperpanjang masa berlaku SessionId AWS.
- Proof harus dikonsumsi oleh UID dan tujuan yang cocok; bukti yang telah digunakan tidak dapat diputar ulang.

## Pemulihan kegagalan

- Jika catatan pendaftaran belum tercatat, login dapat mengarahkan pengguna ke pemulihan liveness. Jangan mengulang pendaftaran dengan membuat akun Firebase baru.
- Jika /activate gagal karena IAM, Worker mengembalikan error dan tidak memberi akses. Administrator memperbaiki izin service account FIREBASE_SERVICE_ACCOUNT_JSON untuk firebaseauth.users.update, lalu pengguna masuk kembali.
- Endpoint POST /activation-diagnostics dapat memeriksa apakah service account Worker memiliki izin tersebut tanpa mengubah role pengguna. permissionCheckStatus=unavailable bukan bukti izin tersedia ataupun tidak tersedia.
- Jika secret AWS belum tersedia, /liveness/health melaporkan konfigurasi belum siap dan pengguna tidak dapat memulai challenge. Aktivasi AWS harus dilakukan melalui akun AWS yang berwenang; rahasia tidak boleh dikirim melalui chat.
- Jika Worker/jaringan tidak tersedia, alur gagal tertutup (fail closed), bukan memberi akses tanpa verifikasi role.

## Fitur persetujuan lama

Endpoint /owner/pending, /owner/approve, /owner/reject, dan /restore-invitation tetap dipertahankan untuk menangani catatan legacy. Endpoint tersebut bukan prasyarat pendaftaran mandiri baru.

## Checklist verifikasi sebelum menyatakan seluruh alur siap produksi

1. Daftar akun sintetis baru dan pastikan akun Firebase dibuat tanpa duplikasi.
2. Pastikan Face Liveness menolak sesi tanpa persetujuan, akun yang tidak cocok, sesi kedaluwarsa, dan bukti yang diputar ulang.
3. Pastikan Worker mencatat pending_email hanya setelah bukti liveness sah.
4. Verifikasi email, masuk kembali, dan pastikan Worker mengeluarkan role=anggota.
5. Uji akun nonaktif, email belum terverifikasi, token invalid, catatan KV hilang, IAM Firebase tidak cukup, dan jaringan terputus; semua harus ditolak tanpa akses.
6. Pastikan anggota tidak dapat membaca data responden/staf melalui Firestore, Storage, Worker arsip, atau Direct Message.
7. Setelah secret AWS tersedia, uji /liveness/health, pembuatan sesi AWS, STS AssumeRole, kamera/stream, hasil Rekognition, konsumsi bukti, serta alur pendaftaran dan login pada browser dan Android fisik.
8. Uji pemulihan akun setelah aplikasi ditutup di tengah pendaftaran dan login berulang dengan akun lama.

Batas bukti: tes unit/emulator dan deployment metadata tidak menggantikan pengujian end-to-end dengan akun Firebase/Google Workspace sintetis dan kamera fisik. Jangan gunakan data responden ODHIV nyata untuk tes.
