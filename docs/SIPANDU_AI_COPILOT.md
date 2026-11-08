# SIPANDU AI Copilot — implementasi dan validasi

## Implementasi awal

- Worker Cloudflare terpisah bernama sipandu-ai.
- Endpoint percakapan hanya POST /api/chat; health check GET /health.
- Autentikasi menggunakan Firebase ID token.
- Klaim role yang didekode hanya petunjuk untuk mempersempit query; Firestore Security Rules tetap memvalidasi token dan mengotorisasi pembacaan.
- Peran pendamping hanya membaca status layanan dengan assignedToUid sesuai UID pada token.
- Worker memproyeksikan field minimum dari ppks dan ppksServiceStatus, lalu membuat ringkasan agregat.
- Konteks Gemini tidak berisi nama, NIK, alamat, telepon, foto, jawaban asesmen klinis, atau teks bebas permintaan bantuan.
- Tidak ada penulisan database, penyimpanan percakapan, function calling, maupun tindakan otomatis.

## Hal yang belum aktif

- Worker belum di-deploy dari pull request.
- API key Gemini belum dipasang sebagai Cloudflare Worker Secret.
- UI SIPANDU belum tersambung ke endpoint Worker.
- Rate limiting perlu dikonfigurasi sebelum penggunaan luas.
- Pengujian perangkat dan uji beban perlu dilakukan sebelum layanan dibuka.

## Validasi

- Unit test agregasi dan sanitasi data.
- Unit test batas klaim role.
- Wrangler type generation dan TypeScript strict check.
- Wrangler dry-run pada GitHub Actions.
- Pull request tidak melakukan deployment Worker produksi.