# Integrasi Google SIPANDU — status dan prosedur

## Sumber yang diberikan pemilik proyek
- Google Form editor: `https://docs.google.com/forms/d/12JJIlBzY9yA5taFIfkQ6r0dJDMEBbEw8ymX7mTUHmYc/edit`
- Spreadsheet respons Form: `https://docs.google.com/spreadsheets/d/1ISR8v6QdDVHLjWjjDO5lIjhvEG-Ukt1KSZtfjx817BQ/htmlview`
- Folder Drive: ID `1TtUYxMv9-f5kcGWqYS_5PK7NwYqUvNgMMV0l1BpzoLdkHJAQ7Ucxg0rbqc9Ue19Wo2w85GV1`

IDs di atas diambil dari URL yang diberikan pengguna, bukan dibuat-buat. Konfigurasi ini tidak membuktikan izin OAuth, kepemilikan, atau akses API.

## Batasan keamanan/data
1. Spreadsheet respons Form diperlakukan sebagai sumber respons yang dibaca, bukan target append database SIPANDU.
2. Database PPKS harus berada pada tab terpisah bernama `SIPANDU` dengan header `ID`, `Timestamp`, `Nama Lengkap`, `NIK`, `Usia`, `Jenis Kelamin`, `Kota Domisili`, `No HP/WA`, `Jenis Bantuan`, `Intervensi Mental`, `Desil`.
3. Fungsi append akan menolak tab kosong tanpa header dan melewati data yang ID atau NIK-nya sudah ada. Ini mencegah duplikasi sederhana, tetapi bukan pengganti transaksi server-side untuk sinkronisasi bersamaan.
4. Jangan menaruh token OAuth, kunci service account, atau data pribadi/medis responden di source code, issue, atau log.

## Pengujian yang masih harus dilakukan melalui UI
1. Buka SIPANDU dan pilih Google Workspace & Cloud Hub.
2. Masuk menggunakan akun Google yang memiliki akses ke ketiga sumber.
3. Uji baca Form (hanya hitung respons), baca spreadsheet, dan daftar berkas dalam folder Drive.
4. Catat nama tab respons yang sebenarnya. Jangan menebak nama tab.
5. Uji tulis hanya ke tab database `SIPANDU` terpisah menggunakan data sintetis, lalu pastikan percobaan kedua tidak membuat baris ganda.
6. Setelah pengujian berhasil, baru petakan judul pertanyaan Form ke kolom SIPANDU. Pemetaan tidak boleh ditebak karena judul pertanyaan/struktur jawaban belum diaudit dari akun pemilik.

## Status
Kode API telah diperkeras di `src/lib/googleWorkspace.ts`. Sinkronisasi end-to-end belum dinyatakan berhasil: sesi ini tidak memiliki token OAuth Google yang terotorisasi untuk memverifikasi isi Form, izin Spreadsheet, atau isi folder Drive.
