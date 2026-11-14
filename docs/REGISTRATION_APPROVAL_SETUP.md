# SIPANDU — Alur Pendaftaran Mandiri dan Aktivasi Anggota

Dokumen ini mencerminkan alur pendaftaran SIPANDU yang berlaku: pendaftaran mandiri terbuka tanpa kode tim dan tanpa undangan.

## Alur pengguna baru

1. Pengguna mengisi nama, email aktif, dan kata sandi pada halaman Pendaftaran Akun.
2. Firebase Authentication membuat identitas akun. SIPANDU membuat profil dasar pada `userProfiles/{uid}` dan Worker mencatat permohonan pada KV dengan status `pending_email`.
3. SIPANDU mengirim tautan verifikasi melalui Firebase Authentication. Pengguna keluar dari sesi pendaftaran sampai verifikasi selesai.
4. Pengguna membuka tautan verifikasi, lalu masuk kembali menggunakan email dan kata sandi.
5. Halaman login memuat ulang status email dan klaim token. Jika email sudah terverifikasi tetapi klaim peran belum ada, login memanggil Worker `POST /activate`.
6. Worker memvalidasi ID token, email terverifikasi, status akun tidak dinonaktifkan, kecocokan UID/email dengan catatan pendaftaran, serta tidak adanya peran lain yang harus dipertahankan. Worker menerbitkan custom claim `role=anggota` melalui Firebase Admin API.
7. Aplikasi memaksa refresh ID token dan memastikan klaim `anggota` sudah tersedia sebelum membuka sesi SIPANDU.

## Batas hak akses

- Akun baru hanya mendapat peran `anggota` dengan hak dasar.
- Peran `owner`, `supervisor`, dan `pendamping` tidak pernah dapat dipilih atau dinaikkan oleh pendaftar melalui request frontend.
- Hak administratif dan akses data responden sensitif tetap dibatasi oleh Firebase custom claims dan Firestore Rules.
- Akun Firebase yang dinonaktifkan ditolak oleh Worker.
- Email belum terverifikasi tidak boleh masuk sebagai anggota. Login akan mengirim ulang tautan verifikasi dan mengakhiri sesi.

## Pemulihan kegagalan

- Jika catatan pendaftaran belum tercatat, login dapat mencoba kembali endpoint `/register` secara idempoten untuk akun yang belum memiliki peran.
- Jika pembuatan profil Firestore terputus, setelah email diverifikasi login memeriksa profil dan membuat profil dasar hanya jika belum ada.
- Jika penerbitan peran gagal karena IAM, Worker mengembalikan error dan akun tidak diberi akses aplikasi. Pengguna tidak perlu membuat akun baru; administrator harus memperbaiki izin service account `FIREBASE_SERVICE_ACCOUNT_JSON` untuk `firebaseauth.users.update`, lalu pengguna mencoba masuk kembali.
- Jika Worker atau jaringan tidak tersedia, login gagal tertutup (fail closed), bukan memberi akses tanpa peran.

## Konfigurasi Worker

Worker `sipandu-registration` memerlukan:
- `FIREBASE_AUTH_API_KEY`
- `FIREBASE_PROJECT_ID`
- Secret `FIREBASE_SERVICE_ACCOUNT_JSON` dengan izin minimum untuk memperbarui custom claims Firebase Authentication
- KV binding `PENDING_REGISTRATIONS`

Periksa `GET /health` untuk konfigurasi yang hilang. Endpoint health hanya mengonfirmasi binding/secret tersedia, bukan membuktikan bahwa nilai service account benar atau izin IAM efektif. Uji aktivasi nyata tetap diperlukan.

## Fitur undangan lama

Endpoint `/owner/pending`, `/owner/approve`, `/owner/reject`, dan `/restore-invitation` masih dipertahankan untuk menangani catatan pendaftaran legacy. Endpoint tersebut bukan bagian dari alur pendaftaran mandiri baru dan tidak boleh dijadikan prasyarat aktivasi akun baru.

## Verifikasi sebelum menyatakan siap produksi

- Daftar akun baru dengan email yang belum pernah digunakan.
- Pastikan status KV menjadi `pending_email` dan email verifikasi benar-benar diterima.
- Coba login sebelum verifikasi: harus ditolak dan tautan verifikasi dikirim ulang.
- Verifikasi email, login kembali, pastikan `/activate` berhasil dan token memuat `role=anggota`.
- Uji akun tanpa catatan KV, akun dinonaktifkan, token invalid, service account tanpa IAM, dan kegagalan jaringan: semuanya harus ditolak tanpa akses.
- Pastikan Owner, Supervisor, dan Pendamping yang sudah ada tetap mempertahankan perannya.
- Pastikan anggota tidak dapat membaca/menulis koleksi PPKS atau asesmen yang dibatasi staf.

**Catatan:** KV Cloudflare bukan penyimpanan transaksi dengan compare-and-swap. Rate limiting berbasis KV juga merupakan pembatasan praktis, bukan mekanisme atomik sempurna terhadap request serentak. Jika pendaftaran berkembang besar, pindahkan state pendaftaran dan rate limit ke Durable Object atau penyimpanan transaksional.

## Biometrik dan liveness

Biometrik perangkat (sidik jari/Face ID untuk membuka sesi lokal) berbeda dari pemeriksaan facial liveness. Integrasi liveness wajah belum menjadi bagian dari alur pendaftaran ini dan tidak boleh diklaim aktif sebelum provider/backend verifikasi diintegrasikan dan diuji.
