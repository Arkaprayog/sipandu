# SIPANDU ODHIV v4.3.0

Tanggal pembaruan: 8 November 2026

## Fitur baru — SIPANDU AI Copilot

- Panel AI Copilot tersedia bagi akun petugas owner, supervisor, dan pendamping.
- Backend AI terpisah dari Worker utama SIPANDU dan Worker pendaftaran.
- AI hanya membaca dan menganalisis; tidak mempunyai endpoint untuk menambah, mengubah, menghapus, atau mengirim data SIPANDU.
- Data Firestore diproyeksikan ke field demografi minimum dan status layanan terstruktur, lalu diringkas menjadi agregat sebelum dikirim ke Gemini.
- Nama, NIK, alamat, nomor telepon, foto, jawaban asesmen klinis, dan teks bebas permintaan bantuan tidak dipakai sebagai konteks Gemini.
- Kategori agregat dengan jumlah 1–4 disembunyikan untuk mengurangi risiko identifikasi melalui kelompok kecil.
- Pola umum NIK, nomor telepon, dan istilah klinis pada pertanyaan/riwayat ditolak oleh pemeriksaan input. Pemeriksaan ini bukan deteksi PII sempurna; petugas tetap tidak boleh mengirim informasi individu.
- Tidak ada penyimpanan riwayat percakapan.
- Peran pendamping hanya membaca status layanan yang ditugaskan kepada UID pendamping berdasarkan Firestore Rules.

## Keamanan dan keterbatasan

- Firestore Security Rules tetap menjadi otoritas final untuk pembacaan data.
- Jenis bantuan yang diminta tidak dianggap sebagai bukti bantuan telah diterima.
- Tidak adanya catatan status layanan tidak dianggap bukti bahwa bantuan belum diterima.
- AI tidak melakukan diagnosis, penetapan kelayakan, atau keputusan yang berdampak pada hak PPKS.
- Layanan AI akan menampilkan kegagalan secara terpisah tanpa menghentikan fitur utama SIPANDU.
- Worker AI belum aktif di produksi sampai API key Gemini dipasang sebagai secret dan deployment disetujui administrator.

## Versi

- Web/PWA: 4.3.0
- Android Debug/Release: versionName 4.3.0; versionCode dihitung otomatis dari package.json menjadi 40300.
- AI Worker: layanan terpisah bernama sipandu-ai.

Catatan: pull request ini menyiapkan integrasi dan pipeline validasi. Deployment produksi tidak dilakukan dari pull request.