# Perlindungan branch main GitHub

Branch main repository SIPANDU sebelumnya terdeteksi belum terlindungi. Pengaturan branch protection/ruleset berada pada administrasi repository GitHub dan tidak dapat ditetapkan dengan mengubah file workflow atau source code. Koneksi GitHub yang tersedia pada sesi ini mendukung pembacaan status proteksi, tetapi tidak menyediakan operasi tulis untuk mengubah pengaturan tersebut.

Aktifkan satu kali melalui GitHub:
1. Buka Settings → Rules → Rulesets → New branch ruleset, atau Settings → Branches → Add branch protection rule.
2. Target branch main.
3. Wajibkan pull request sebelum merge. Jika ada maintainer kedua, wajibkan minimal satu approval; jangan mengandalkan CODEOWNERS saja.
4. Wajibkan pemeriksaan yang benar-benar muncul pada pull request: Pages build, CodeQL, Native Android build, dan Firebase Rules emulator tests. Tambahkan validasi Worker dan Assessment Archive Worker setelah workflow tersebut menjalankan tes pada pull request.
5. Wajibkan branch terbaru sebelum merge, blokir force push, dan blokir penghapusan branch.
6. Jangan wajibkan signed commits kecuali seluruh maintainer sudah menyiapkan penandatanganan commit.
7. Simpan ruleset lalu pastikan halaman branch main menampilkan status protected.

Sampai pengaturan ini diaktifkan pada GitHub, branch main masih belum terlindungi walaupun seluruh workflow CI/deployment sukses.
