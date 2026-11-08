# SIPANDU AI Copilot — implementasi dan validasi

## Implementasi awal

- Worker Cloudflare terpisah bernama sipandu-ai.
- Endpoint percakapan hanya POST /api/chat; health check GET /health.
- Autentikasi menggunakan Firebase ID token.
- Worker memverifikasi JWT Firebase RS256 beserta issuer/audience/waktu, role claim, UID akun, status disabled, dan waktu pencabutan token. Firestore Security Rules tetap mengotorisasi setiap pembacaan.
- Peran pendamping hanya membaca status layanan dengan assignedToUid sesuai UID pada token.
- Worker memproyeksikan field minimum dari ppks dan ppksServiceStatus, lalu membuat ringkasan agregat.
- Konteks Gemini tidak berisi nama, NIK, alamat, telepon, foto, jawaban asesmen klinis, atau teks bebas permintaan bantuan.
- Tidak ada penulisan database, penyimpanan percakapan, function calling, maupun tindakan otomatis.

## Hal yang belum aktif

- Worker belum di-deploy dari pull request.
- API key Gemini belum dipasang sebagai Cloudflare Worker Secret.
- Komponen UI SIPANDU AI Copilot sudah tersedia di dashboard dan dibatasi melalui health check Worker; tombol tetap tersembunyi sebelum kedua secret/konfigurasi runtime tersedia.
- Cloudflare Rate Limiting binding dikonfigurasi pada Worker: 60/menit per IP dan 10/menit per UID, dengan batas approximate per lokasi Cloudflare.
- Pengujian perangkat dan uji beban perlu dilakukan sebelum layanan dibuka.

## Validasi

- Unit test agregasi dan sanitasi data.
- Unit test batas klaim role.
- Wrangler type generation dan TypeScript strict check.
- Wrangler dry-run pada GitHub Actions.
- Pull request hanya menjalankan validasi dan tidak melakukan deployment Worker produksi.
- Worker tetap `configured=false` sampai administrator memasang `GEMINI_API_KEY` sebagai Cloudflare Worker Secret.