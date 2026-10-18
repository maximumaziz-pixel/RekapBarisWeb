# RekapBaris

Website statis untuk memperkenalkan RekapBaris dan menampilkan contoh katalog event serta merchandise. Tidak memerlukan Node.js, server aplikasi, database, atau proses build.

## Struktur file

```text
index.html
styles.css
shop.css
app.js
assets/
  logo-rekapbaris.png
```

## Menjalankan dan deploy

- Buka `index.html` langsung di browser untuk melihat website.
- Jika ingin menjalankan melalui Node.js, gunakan Node.js 18 atau lebih baru lalu jalankan `npm start`; server statis tersedia di `http://localhost:3000` (port dapat diubah melalui environment variable `PORT`).
- Untuk hosting biasa, unggah `index.html`, kedua file CSS, `app.js`, dan folder `assets/` ke document root hosting (umumnya `public_html`).
- Pastikan struktur file dan folder dipertahankan agar path relatif tetap berfungsi.

## Fitur

- Tata letak responsif, navigasi mobile, dan pilihan tema terang/gelap.
- Pencarian, filter status, dan pengurutan untuk contoh event statis.
- Contoh katalog merchandise.
- Tautan email untuk pertanyaan seputar event dan merchandise.

Website ini hanya frontend statis. Login, pendaftaran, dashboard, pengelolaan event, voting, pemesanan, dan pembayaran tidak tersedia. Katalog dan harga yang ditampilkan adalah contoh, bukan data event atau penawaran aktif.
