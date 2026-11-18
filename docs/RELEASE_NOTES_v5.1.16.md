# SIPANDU 5.1.16

## Perbaikan kontrak Face Liveness
- Validasi sisi klien terhadap respons pembuatan sesi: `expiresInSeconds` harus berupa angka positif dan tidak boleh melebihi batas AWS 180 detik.
- Respons yang kehilangan masa berlaku, bernilai nol/tidak valid, atau melebihi tiga menit ditolak sebelum iframe kamera dijalankan.
- Menambahkan tes regresi untuk respons sesi yang terlalu lama dan masa berlaku nol.

## Versi aplikasi
- Web / PWA / Android: **5.1.16**.
- Perubahan ini tidak mengubah data responden, IAM, atau secret produksi.

## Batas verifikasi
Face Liveness produksi masih memerlukan konfigurasi tiga secret AWS yang sah pada Worker, lalu health check dan tes kamera nyata.
