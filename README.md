# RekapBaris

Platform web responsif untuk informasi event, pendaftaran akun, verifikasi, voting, tiket, dan dashboard pengelola. Aplikasi menggunakan Node.js, Express, SQLite, dan browser biasa—tidak perlu memasang framework frontend.

> Integrasi Google, email, dan pembayaran memakai akun/kunci milik pemilik situs. Demi keamanan, kunci tersebut tidak disertakan. Tanpa konfigurasi integrasi, halaman dan fitur inti tetap berjalan; server menampilkan pesan yang jelas saat fitur eksternal belum aktif.

## Menjalankan di komputer

1. Pasang Node.js versi **18, 20, 22, atau 24**. Di Hostinger pilih salah satu versi tersebut pada pengaturan aplikasi Node.js.
2. Buka folder proyek ini di VS Code. Instal dependensi sekali dengan `npm install`.
3. Salin `.env.example` menjadi `.env`, lalu ubah `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `TEAM_EMAIL`, dan `TEAM_PASSWORD`. Password staf harus sekurang-kurangnya 12 karakter. Contoh secret acak dapat dibuat dengan `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"`.
4. Jalankan `npm start`, lalu buka `http://localhost:3000`. Server menyajikan halaman utama `index.html` dan memuat stylesheet serta aset dari folder `public`.

Untuk pengembangan gunakan `npm run dev`. Server otomatis membuat folder `data`, database SQLite, contoh event, dan peserta voting saat pertama kali berjalan. `npm run check` memeriksa sintaks JavaScript.

### Akun Tim Rekap dan Admin

Isi kredensial awal di `.env` **sebelum menjalankan aplikasi untuk pertama kali**. Akun dengan role admin/tim akan dibuat sekali dan langsung terverifikasi. Setelah login, gunakan **Dashboard → Akun saya** untuk mengganti nama, email login, atau password; Admin juga dapat memakai **Akun staf** untuk membuat akun staf tambahan. Kredensial akun yang sudah ada tidak diubah otomatis saat nilai `.env` berubah.

## Konfigurasi layanan

### Email reset password

Isi `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, dan `MAIL_FROM` pada `.env` dengan pengaturan SMTP Hostinger atau penyedia email Anda. Jangan membagikan file `.env`. Permintaan reset memakai token satu kali yang kedaluwarsa setelah 30 menit. Jika SMTP belum diatur, halaman menampilkan pesan konfigurasi yang jelas; permintaan tidak berpura-pura email sudah dikirim.

### Login Google

1. Buat OAuth Client ID bertipe Web di Google Cloud Console dan tambahkan domain situs pada **Authorized JavaScript origins**.
2. Isi `GOOGLE_CLIENT_ID` pada `.env`, restart aplikasi, dan pastikan Google Identity Services dapat dimuat pada domain tersebut.
3. Google memverifikasi identitas; akun baru tetap berstatus **menunggu verifikasi** sampai Tim Rekap/Admin menyetujuinya.

### QRIS Midtrans

1. Aktifkan Snap dan metode QRIS pada dashboard Midtrans.
2. Masukkan **Server Key** ke `MIDTRANS_SERVER_KEY`. Jangan masukkan Server Key di frontend, repo publik, atau chat.
3. Untuk uji coba isi `MIDTRANS_IS_PRODUCTION=false`; untuk transaksi live gunakan Server Key production dan set `true`.
4. Di dashboard Midtrans atur **Payment Notification URL** menjadi `https://domain-anda.tld/api/payments/notification`.
5. Atur `APP_URL` ke URL publik HTTPS Anda dan sesuaikan `VOTE_PRICE`.

Checkout dibuka di halaman Snap Midtrans. Vote dan statistik tiket baru tercatat sebagai transaksi sukses sesudah notifikasi Midtrans dengan signature valid diterima. Gunakan akun sandbox untuk menguji alur; QRIS tersedia sesuai metode pembayaran yang diaktifkan pada akun Midtrans.

## Deploy ke Hostinger

1. Di hPanel buka **Websites → Add Website → Node.js Web App** (nama menu dapat berbeda menurut paket).
2. Upload/Hubungkan file proyek ke folder aplikasi, termasuk `package.json`, `server.js`, `public/`, dan logo. Jangan unggah `node_modules`, `.env`, atau database lokal.
3. Pilih Node.js 18/20/22/24, jalankan instalasi dependensi melalui pengaturan aplikasi Hostinger, dan set startup file ke `server.js` (atau start command `npm start` jika tersedia).
4. Isi environment variables dari `.env.example` pada pengaturan aplikasi Hostinger. Gunakan password kuat, secret acak, URL HTTPS domain sendiri, serta kunci layanan production yang tepat.
5. Set `DATABASE_PATH` ke folder data yang persisten dan dapat ditulis proses Node, misalnya `./data/rekapbaris.sqlite`. Pastikan Hostinger tidak menghapus data tersebut saat deployment ulang. Siapkan backup terjadwal untuk database SQLite.
6. Deploy/restart aplikasi melalui hPanel dan buka domain HTTPS. Pastikan halaman event tampil, login staf berhasil, SMTP mengirim email uji, dan Midtrans mengirim notifikasi sandbox.

Hostinger mengelola proses Node melalui panelnya. Tidak ada script web yang dapat secara aman melewati instalasi dependensi, memasang environment rahasia, membuat akun layanan pihak ketiga, atau menerbitkan aplikasi otomatis tanpa tindakan pemilik akun. Ikuti langkah panel; server tidak memerlukan terminal untuk tetap berjalan setelah aplikasi Node dipasang dan dijalankan oleh Hostinger.

### Penting untuk produksi

- Gunakan HTTPS, password staf yang unik, dan jaga `.env` serta file `data/rekapbaris.sqlite` tetap privat.
- Atur backup database dan uji restore. SQLite sesuai untuk instalasi awal/single instance; untuk trafik tinggi atau banyak instance, migrasikan ke PostgreSQL terkelola sebelum scale-out.
- CORS tidak dibuka untuk origin lain. Server memakai cookie sesi HttpOnly, password scrypt, token reset satu kali, serta validasi signature notifikasi Midtrans.
- Akun baru (termasuk Google) harus diverifikasi staf sebelum membuat transaksi. Kredensial awal staf hanya dibuat saat akun belum ada.
- Event contoh boleh diubah lewat SQLite atau dihapus melalui alur administrasi yang kelak Anda tambahkan; jangan mengandalkan data contoh di situs produksi.

## Fitur yang tersedia

- Landing page RekapBaris, logo proyek, pola batik geometris, mode terang/gelap, navigasi animasi, dan tata letak desktop/tablet/ponsel.
- Daftar event dengan poster, pencarian, filter status, pengurutan, detail event, harga tiket, dan peserta voting contoh.
- Pendaftaran Peserta, Penyelenggara, dan Juri; login/logout; login/daftar Google opsional; reset password melalui email SMTP.
- Panel Juri untuk memberi dan memperbarui nilai 1–100 bagi kandidat event.
- Dashboard Penyelenggara untuk mengajukan event dan memantau persetujuan Tim Rekap. Admin dapat membuat event langsung; pengajuan penyelenggara baru tampil di daftar publik setelah disetujui.
- Dashboard Tim Rekap/Admin untuk verifikasi pendaftar dan pengajuan event, ringkasan transaksi, serta pembuatan akun staf. Admin dapat menambahkan kandidat.
- Katalog merchandise dan checkout pesanan dengan alamat pengiriman; pembayaran tiket, voting, dan merchandise memakai Midtrans Snap setelah kredensial diatur.

## Ekstensi VS Code yang direkomendasikan

- **ESLint** — analisis dan konsistensi JavaScript.
- **Prettier - Code formatter** — format file HTML, CSS, dan JavaScript.
- **DotENV** — pewarnaan `.env` (jangan pernah membagikan isinya).
- **SQLite Viewer** — inspeksi database lokal `data/rekapbaris.sqlite`.
- **REST Client** — menguji endpoint API dari file request lokal.

Untuk proyek ini tidak diperlukan Angular, React, Vue, ataupun framework frontend lain. UI menggunakan HTML/CSS/JavaScript agar instalasi di Node.js Hostinger tetap sederhana.