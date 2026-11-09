# Pengingat Tindak Lanjut SIPANDU

Pengingat tindak lanjut memiliki dua lapisan:

1. Agenda dalam aplikasi pada menu **Layanan PPKS**, dihitung dari tanggal tindak lanjut yang secara eksplisit disimpan petugas.
2. Notifikasi lokal Android, satu notifikasi generik per tanggal jatuh tempo (dan satu pengingat agregat untuk agenda terlambat), setelah petugas memberi izin pada **Pengaturan → Pemberitahuan & Pengingat**.

Notifikasi tidak memuat nama, NIK, alamat, nomor kontak, status kesehatan, jenis bantuan, atau isi asesmen. Pendamping hanya dijadwalkan dari status layanan yang penugasannya sesuai UID akun; owner/supervisor memakai cakupan status yang dapat mereka akses.

Batas: jadwal lokal disinkronkan saat aplikasi dibuka dan feed status layanan berhasil dimuat. Ini bukan push reminder server-side dan tidak menjamin pemrosesan perubahan data baru ketika aplikasi belum pernah dibuka untuk menyinkronkan jadwal. Waktu penyampaian mengikuti izin notifikasi, izin alarm, Doze, dan pengaturan baterai Android. PWA/browser tetap melihat agenda ketika aplikasi dibuka, tetapi fitur penjadwalan lokal ini khusus Android native.