# SIPANDU AI Worker

Worker Cloudflare terpisah untuk SIPANDU AI Copilot. Layanan ini hanya membaca dan menganalisis; tidak menyediakan operasi Firestore tulis, ubah, hapus, unggah, atau sinkronisasi.

## Batas keamanan

- Autentikasi menggunakan Firebase ID token dari sesi SIPANDU.
- Worker memverifikasi tanda tangan JWT Firebase RS256, issuer, audience, UID, waktu token, role claim, status akun, dan batas revokasi sebelum query. Firestore REST tetap menerima token asli dan menerapkan Firestore Security Rules pada setiap pembacaan.
- Peran yang diterima: owner, supervisor, pendamping.
- Untuk pendamping, query status layanan dibatasi dengan assignedToUid sama dengan UID akun. Firestore Rules tetap menjadi otoritas final.
- Hanya field demografi minimum dan status layanan terstruktur yang dibaca.
- Field nama, NIK, alamat, nomor telepon, foto, asesmen klinis, dan catatan bebas tidak pernah dipilih dari Firestore atau diteruskan sebagai konteks data. Worker juga menolak pola umum NIK, nomor telepon, dan istilah klinis pada pertanyaan/riwayat; pemeriksaan pola ini bukan deteksi PII yang sempurna, sehingga petugas tetap dilarang memasukkan informasi individu.
- Teks bebas jenis bantuan dipetakan ke kategori aman; teks aslinya tidak dikirim ke Gemini.
- Tidak ada penyimpanan percakapan atau endpoint mutasi data.

## Konfigurasi dan deploy

1. Buat API key Gemini melalui Google AI Studio.
2. Deploy versi awal Worker melalui workflow yang digate. Worker tetap tidak menerima percakapan sampai secret Gemini dipasang.
3. Pasang API key Gemini sebagai Cloudflare Worker Secret bernama GEMINI_API_KEY melalui Dashboard Cloudflare. Jangan masukkan ke vars, frontend, GitHub source, atau file repositori.
4. CI menjalankan Wrangler type generation, TypeScript strict check, unit tests, dan dry-run bundle.
5. Health check: GET /health. Endpoint percakapan: POST /api/chat.

Model default adalah gemini-3.8-flash. Administrator dapat mengganti nama model melalui variabel GEMINI_MODEL.

Deployment otomatis tetap dinonaktifkan jika repository variable SIPANDU_AI_DEPLOY_ENABLED tidak bernilai true. Workflow juga memerlukan GitHub secret CLOUDFLARE_API_TOKEN. Pull request hanya menjalankan validasi dan tidak pernah deploy.

## Endpoint POST /api/chat

Headers: Authorization: Bearer Firebase ID token; Content-Type: application/json.

Body contoh:

    {
      "prompt": "Analisis permintaan bantuan PPKS berdasarkan data yang tersedia."
    }

Batas input: prompt maksimum 1.200 karakter dan body maksimum 12 KB. Jangan sertakan identitas pribadi atau isi asesmen individual.

## Operasional

Kelompok statistik dengan jumlah 1–4 disembunyikan untuk mengurangi risiko identifikasi. Teks bebas jenis bantuan dipetakan ke kategori tetap, dan satu PPKS dapat masuk lebih dari satu kategori. Worker memakai Cloudflare Rate Limiting binding: 60 permintaan/menit per IP dan 10 permintaan/menit per UID, bersifat approximate dan lokal per lokasi Cloudflare, bukan kuota global ketat. Batas input dan output tetap berlaku.