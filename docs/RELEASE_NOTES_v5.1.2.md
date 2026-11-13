# SIPANDU ODHIV 5.1.2

Tanggal: 13 November 2026

## Perbaikan dan pemeliharaan
- Memperbaiki dokumentasi alur pendaftaran mandiri agar sama dengan implementasi saat ini: formulir meminta nama, email, password, dan konfirmasi; aktivasi dilakukan setelah verifikasi email.
- Menjelaskan bahwa aktivasi mandiri hanya memberikan peran dasar anggota dan tidak dapat menaikkan hak akses menjadi pendamping, supervisor, atau owner.
- Memperjelas pembatasan akses anggota pada profil sendiri serta larangan akses terhadap data responden dan fitur operasional staf.
- Menambahkan laporan audit alur utama aplikasi, bukti pemeriksaan otomatis, serta pekerjaan keamanan repositori yang masih memerlukan pengaturan administrator.

## Hasil audit repositori
- Meninjau alur autentikasi/pendaftaran, verifikasi email, pemberian peran, aturan Firestore dan Storage, intake responden, formulir dan arsip asesmen, integrasi Google Workspace/Drive, layanan/kunjungan, direct message, serta pipeline web dan Android.
- Kode saat ini telah membatasi peran anggota di luar cakupan staf; pengujian Firebase Rules mencakup larangan membaca dan menulis data responden serta dokumen sensitif.
- Pemeriksaan Actions pada branch main yang terlihat saat audit menunjukkan workflow CodeQL, GitHub Pages, build Android, dan deployment Worker terakhir berstatus berhasil.
- Branch main belum dilindungi. Pengaturan branch protection/ruleset memerlukan hak administrasi repositori dan belum dapat diterapkan melalui koneksi kerja ini; tindak lanjut tercatat pada issue #231.

## Batas validasi
- Audit ini merupakan pemeriksaan kode dan konfigurasi repositori. Tidak dilakukan transaksi uji pada akun Firebase/Google Workspace produksi, tidak mengubah data responden, dan tidak memvalidasi kamera/printer pada perangkat fisik.
- Perubahan pada branch audit tidak menjalankan deployment produksi. Build, tes, dan pemeriksaan PR harus selesai sebelum perubahan digabung ke main.

## Versi
- Web/PWA: 5.1.2.
- Android versionName: 5.1.2.
- Android versionCode: 50102 (dihitung otomatis dari package.json).
