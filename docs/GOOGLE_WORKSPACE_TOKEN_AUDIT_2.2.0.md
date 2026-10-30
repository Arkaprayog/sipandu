# Audit Integrasi Google Workspace — SIPANDU 2.2.0

Tanggal audit: 2026-10-30

## Temuan terverifikasi

- Aplikasi menyimpan Google OAuth access token di `sessionStorage` dengan batas cache 55 menit.
- Kebijakan reotorisasi aplikasi 90 hari saat ini hanya menyimpan timestamp otorisasi di `localStorage`; timestamp ini bukan refresh token dan tidak memperpanjang access token Google.
- Proses login Workspace yang ada menggunakan Firebase Auth / GoogleAuthProvider dan mengambil access token dari credential hasil login.
- Konfigurasi Worker Cloudflare `sipandu` yang diperiksa memiliki `bindings: []`. Dengan demikian, pada konfigurasi Worker aktif yang terlihat saat audit, belum ada binding penyimpanan/token maupun layanan backend OAuth yang dapat digunakan untuk menyimpan refresh token.
- Repository yang diperiksa memiliki `wrangler.jsonc`, tetapi tidak memiliki source Worker terpisah yang teridentifikasi pada pohon file repository. Worker aktif dikelola/deploy terpisah dari sumber aplikasi yang ditemukan.

## Keputusan keamanan

1. Jangan mengubah cache access token 55 menit menjadi 90 hari. Google mengendalikan masa berlaku access token; menyimpan token lama sebagai valid akan menyebabkan kegagalan API dan meningkatkan risiko kebocoran.
2. Terapkan 90 hari sebagai masa berlaku grant/otorisasi administratif, terpisah dari masa hidup access token.
3. Untuk auto-refresh yang benar, backend harus memperoleh OAuth authorization code dengan akses offline dan menyimpan refresh token secara terenkripsi di sisi server. Refresh token tidak boleh disimpan di browser, localStorage, sessionStorage, atau aplikasi Android.
4. Worker harus menukar refresh token dengan access token baru di server sebelum kedaluwarsa. Jika refresh token dicabut/invalid, sistem harus meminta admin mengotorisasi ulang.
5. Implementasi backend tidak boleh dilakukan sampai OAuth client/redirect URI, metode penyimpanan rahasia, serta binding Worker yang tepat dapat diverifikasi dan disiapkan. Jangan membuat/mengganti secret produksi atau mengubah database produksi tanpa persetujuan eksplisit.

## Batas pekerjaan rilis ini

Versi aplikasi dinaikkan dari 2.1.15 menjadi 2.2.0 untuk menyiapkan rilis berikutnya. Kenaikan versi ini **tidak berarti** mekanisme refresh token 90 hari telah aktif. Perubahan backend OAuth ditahan agar tidak mengarang konfigurasi, tidak merusak sesi Google Workspace yang berjalan, dan tidak menyentuh database/secret produksi maupun halaman login admin.

## Validasi lanjutan yang diperlukan

- Tentukan OAuth Web Client ID yang dipakai untuk alur server-side dan URI callback resmi.
- Pastikan akun Google Workspace mengizinkan OAuth offline access dan kebijakan consent yang sesuai.
- Siapkan penyimpanan secret terenkripsi untuk refresh token serta kunci enkripsi terpisah melalui proses persetujuan admin.
- Tambahkan endpoint Worker untuk callback OAuth, refresh token, status otorisasi, dan pencabutan; lindungi endpoint dengan autentikasi/otorisasi server-side.
- Uji refresh, token revoked, expiry, race condition, dan pemulihan koneksi pada staging sebelum aktivasi produksi.
