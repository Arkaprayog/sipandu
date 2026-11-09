# SIPANDU ODHIV — Catatan Rilis v5.0.1

Tanggal: 9 November 2026

## Pembaruan
- Memperbarui nomor WhatsApp pada profil akun owner menjadi 088807185166 dan menyelaraskannya ke profil Firebase milik owner saja.
- Memperbarui sumber Google Form, spreadsheet respons, dan folder Google Drive sesuai konfigurasi terbaru dari pemilik aplikasi.
- Menghilangkan tampilan URL mentah dan tautan eksternal Google Form/Spreadsheet/Drive dari Google Workspace & Cloud Hub. Sumber dipilih melalui nama sumber/daftar pilihan, sementara ID dan URL tetap dipakai secara internal untuk sinkronisasi.
- Mengunci sumber Drive SIPANDU ke folder yang telah ditentukan dan mencegah spreadsheet respons Form dipilih sebagai database tujuan tulis.
- Memperbarui metadata versi web/PWA menjadi 5.0.1.

## Catatan operasional
- Tindakan WhatsApp dari perangkat membuka percakapan ke nomor PPKS menggunakan sesi/akun WhatsApp yang sedang aktif pada perangkat. Nomor profil owner tidak dapat memaksa aplikasi WhatsApp mengganti akun pengirim.
- Build atau deployment yang lulus tidak dengan sendirinya membuktikan izin OAuth Google pada Form, Spreadsheet, dan Drive. Izin sumber perlu diverifikasi melalui diagnostik Google Workspace di aplikasi.
