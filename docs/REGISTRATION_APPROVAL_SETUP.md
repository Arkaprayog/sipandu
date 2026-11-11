# SIPANDU — Konfigurasi Pendaftaran Tim dan Persetujuan

Dokumen ini menjelaskan konfigurasi eksternal yang diperlukan agar alur pendaftaran tim beroperasi penuh. Kode persetujuan Owner/Supervisor berada di `registration-worker/` dan Worker yang dipakai adalah `sipandu-registration`.

## Alur yang sudah tersedia di kode

1. Pengguna mendaftar dengan nama, email, dan kata sandi.
2. SIPANDU membuat identitas Firebase dan menyimpan permohonan ke KV dengan status `pending_owner`.
3. Owner (atau Supervisor yang secara eksplisit didelegasikan) melihat permohonan di menu **Pendaftaran Tim**.
4. Keputusan persetujuan/penolakan dicatat satu kali di KV. Supervisor yang tidak didelegasikan tidak dapat melihat antrean atau mengambil keputusan.
5. Setelah disetujui, pendaftar masuk kembali. SIPANDU baru mengirim tautan verifikasi Firebase pada saat itu.
6. Setelah email diverifikasi, Worker menerbitkan peran `pendamping`. Akun Owner, Supervisor, dan Pendamping yang sudah ada dipertahankan.

## Konfigurasi Resend

Di Cloudflare Dashboard buka **Workers & Pages → sipandu-registration → Settings → Variables and Secrets**.

Tambahkan:
- Secret `RESEND_API_KEY`: API key dari proyek Resend.
- Variable `SIPANDU_EMAIL_FROM`: alamat pengirim pada domain yang sudah diverifikasi di Resend, misalnya `SIPANDU <noreply@domain-anda>`.
- Variable `OWNER_NOTIFICATION_EMAIL`: alamat email Owner yang menerima pemberitahuan permohonan baru.

Jangan menaruh API key di kode frontend, GitHub repository, atau chat. Setelah konfigurasi disimpan, lakukan redeploy Worker atau tunggu deployment berikutnya. Endpoint tetap akan memberi indikator `emailNotificationSent=false` bila pengiriman belum berhasil.

Tautan verifikasi email masih dikirim melalui Firebase Authentication setelah persetujuan, bukan melalui Resend. Ini disengaja agar SIPANDU tidak perlu menyimpan token aktivasi sendiri atau mengirim tautan verifikasi yang belum diverifikasi oleh Firebase.

## AWS Rekognition Face Liveness dan Face Compare

**Belum aktif dalam rilis ini.** Repository saat ini belum memiliki integrasi Rekognition, komponen capture liveness, atau penyimpanan hasil verifikasi wajah. Jangan menganggap pendaftaran sudah memeriksa wajah.

Sebelum integrasi dapat diaktifkan, akun AWS harus menyediakan:
- AWS Region untuk Rekognition.
- IAM role/service credentials khusus backend dengan izin minimum untuk membuat sesi liveness, mengambil hasil sesi, dan menjalankan `rekognition:CompareFaces`.
- Konfigurasi identitas sementara untuk komponen capture liveness di browser/PWA/Android (umumnya Cognito Identity Pool atau mekanisme kredensial sementara setara).
- Kebijakan retensi dan penghapusan frame/hasil liveness serta foto referensi. Jangan menyimpan video/frame wajah lebih lama dari kebutuhan verifikasi.

Access key AWS tidak boleh diletakkan di frontend. Backend harus memverifikasi hasil liveness dari AWS sebelum mengizinkan alur pendaftaran berlanjut, dan pemanggilan Face Compare hanya boleh dilakukan terhadap foto referensi yang memang sah dimiliki organisasi.

## Pemeriksaan sebelum produksi

- Uji akun Owner yang sudah ada: login dan akses dashboard harus tetap berfungsi.
- Uji Supervisor tanpa delegasi: endpoint `/owner/pending` dan `/owner/approve` harus mengembalikan HTTP 403.
- Uji Supervisor dengan delegasi: antrean dan keputusan harus dapat digunakan.
- Uji pendaftaran baru: status awal harus `pending_owner`, dan belum ada email verifikasi sebelum persetujuan.
- Uji penolakan: status menjadi `rejected` dan aktivasi ditolak.
- Uji persetujuan: pendaftar menerima email verifikasi Firebase hanya setelah masuk kembali.
- Pastikan Resend domain terverifikasi dan notifikasi benar-benar diterima sebelum menyatakan email notification aktif.
- Uji face liveness dan compare pada perangkat nyata sebelum mengaktifkannya sebagai syarat pendaftaran.

**Catatan:** KV Cloudflare cocok untuk antrean sederhana, tetapi bukan transaksi database dengan compare-and-swap. Untuk kebutuhan audit dan keputusan serentak yang harus dijamin atomik, pindahkan status permohonan ke D1 atau Durable Object sebelum volume produksi besar.
