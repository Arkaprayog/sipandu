# SIPANDU ODHIV v4.1.0

## Rilis utama: Command Center & Service Center

### Perubahan utama
- Mengganti panel teknis Google Spreadsheet Live Sync di Beranda dengan **Pusat Monitoring Layanan PPKS**.
- Ringkasan Command Center menghitung total PPKS dari roster aplikasi aktif, kebutuhan bantuan nutrisi, kebutuhan kewirausahaan, status terapi psikososial, dan tindak lanjut dari catatan yang tersimpan.
- Google Workspace Live Sync tetap aktif dan tetap dapat dikelola melalui Pengaturan/Integrasi Google Workspace; hanya panel teknisnya yang tidak lagi mengambil ruang utama Beranda.
- Menambahkan menu **Layanan PPKS** dengan pencarian, filter wilayah, filter jenis layanan, pagination, dan ringkasan operasional.
- Menambahkan status terpisah untuk bantuan nutrisi dan kewirausahaan: belum diverifikasi, dibutuhkan, dalam proses, diterima, atau tidak dibutuhkan.
- Menambahkan pemantauan terapi psikososial: belum dimulai, terjadwal, berjalan, atau selesai.
- Menambahkan penjadwalan tindak lanjut, alasan tindak lanjut, riwayat aktivitas per PPKS, dan ekspor rekap CSV.
- Data layanan disimpan pada koleksi Firestore terpisah dari roster Google Spreadsheet. Roster tetap menjadi sumber identitas dan demografi.

### Perlindungan data
- Catatan operasional layanan hanya berisi status dan metadata terstruktur. Tidak tersedia kolom bebas untuk NIK, diagnosis, status HIV, regimen ARV, atau narasi klinis.
- Riwayat aktivitas bersifat append-only dari aplikasi.
- Status layanan baru dibuat oleh owner/supervisor. Pendamping hanya dapat membaca dan memperbarui catatan yang sudah ditugaskan kepadanya.
- Firestore Rules menolak akses untuk akun tanpa role staf yang sah.
- Kebutuhan awal hanya diinferensikan dari jenis bantuan yang diminta atau rekomendasi asesmen eksplisit; penerimaan bantuan tidak diasumsikan.

### Skala dan kinerja
- Roster tidak dibatasi pada angka 47. Ringkasan dan daftar menggunakan jumlah aktual dari roster aplikasi.
- Status layanan dibaca hanya untuk ID PPKS pada roster aktif dan dibagi dalam batch kueri maksimal 30 ID.
- Daftar Layanan PPKS memakai pagination agar tampilan lebih ringan untuk ribuan data.

### Versi platform
- PWA Android: 4.1.0
- PWA iOS: 4.1.0 (manifest web/PWA bersama)
- Android Debug APK: 4.1.0 / versionCode 40100
- Android Release APK: 4.1.0 / versionCode 40100

### Batas rilis
Penugasan kasus oleh admin ke akun pendamping melalui direktori staf, peta cakupan layanan, rujukan antar-instansi, portal publik, dan rekomendasi AI tidak diaktifkan dalam rilis ini karena memerlukan direktori staf, perjanjian berbagi data, atau tata kelola tambahan. Struktur saat ini menjaga fondasi untuk pengembangan berikutnya tanpa mengarang data historis atau hasil bantuan.
