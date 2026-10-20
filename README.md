# Rekap Baris

Platform manajemen event perlombaan, pendaftaran peserta, e-voting, e-ticketing, dan merchandise. Aplikasi memakai React + Vite + Tailwind CSS, Express, PostgreSQL, Prisma, Google OAuth 2.0, dan pembayaran QRIS Midtrans.

## Fitur

- Beranda responsif dengan tema biru-emas dan toggle mode terang/gelap.
- Direktori event dengan pencarian, filter status, dan pengurutan.
- Pendaftaran peserta yang dapat diverifikasi staf.
- E-voting, tiket penonton, dan merchandise melalui Midtrans Snap QRIS.
- Login/daftar Google OAuth; pengguna baru menunggu persetujuan staf.
- Dashboard Admin/Tim untuk ringkasan, akun, event, peserta, pembayaran, serta stok/produk.
- Tombol chat WhatsApp Admin yang tersedia pada semua halaman.
- Express menyajikan UI, aset `public/`, dan berkas `UPLOAD_DIR` melalui `/uploads/`.

## Isi proyek

```text
RekapBarisWeb/
├── .env.example             Template konfigurasi (tidak berisi secret)
├── ecosystem.config.js      Konfigurasi PM2
├── index.html
├── package.json
├── postcss.config.js
├── server.js                Express API, OAuth, pembayaran, dan static file server
├── tailwind.config.js
├── vite.config.js
├── prisma/
│   ├── schema.prisma
│   └── seed.js               Membuat/memperbarui akun Admin dan Tim
├── public/
│   └── logo.svg
└── src/
    ├── App.jsx
    ├── main.jsx
    ├── styles.css
    └── components/
```

File rahasia `.env` berada di root lokal/production dan diabaikan Git. Jangan mengirim atau memasukkan file itu ke Git.

## 1. Persiapan komputer

Langkah-langkah berikut ditujukan untuk pemula. Untuk Windows, buka PowerShell atau Terminal dari VS Code.

1. **Pasang Node.js.** Unduh versi LTS 20.x dari [nodejs.org](https://nodejs.org/), jalankan installer, lalu buka terminal baru dan periksa:

   ```powershell
   node --version
   npm --version
   ```

   Node.js 18.18 atau lebih baru juga didukung.
2. **Pasang Git.** Unduh dari [git-scm.com](https://git-scm.com/downloads), lalu verifikasi dengan `git --version`.
3. **Pasang Visual Studio Code.** Unduh dari [code.visualstudio.com](https://code.visualstudio.com/). Buka folder proyek melalui **File → Open Folder**.
4. **Siapkan PostgreSQL.** Pasang PostgreSQL 15 atau 16 dari [postgresql.org/download](https://www.postgresql.org/download/) (installer Windows dari EnterpriseDB juga tersedia). Ingat password yang dibuat untuk user `postgres`.
5. **Siapkan akun integrasi.**
   - Buat project Google Cloud, aktifkan Google Identity/OAuth, lalu buat OAuth Client ID jenis **Web application**.
   - Buat akun [Midtrans Sandbox](https://dashboard.sandbox.midtrans.com/) untuk pengujian. Jangan gunakan Server Key production saat development.
   - Tentukan nomor WhatsApp Admin dalam format internasional, misalnya `62812...` (tanpa `+`).

## 2. Unduh dan pasang aplikasi

Clone repositori dari terminal:

```powershell
git clone https://github.com/maximumaziz-pixel/RekapBarisWeb.git
cd RekapBarisWeb
code .
```

Jika folder proyek sudah tersedia, cukup buka folder itu dan lanjut ke langkah konfigurasi.

Salin template environment menjadi `.env`:

```powershell
Copy-Item .env.example .env
```

Buka `.env` di VS Code, lalu isi `DATABASE_URL`, `JWT_SECRET`, Google OAuth, Midtrans, nomor WhatsApp, serta nama dan email staf. Contoh URL database lokal:

```text
DATABASE_URL="postgresql://rekapbaris:password-anda@localhost:5432/rekapbaris?schema=public"
```

Password yang mengandung karakter khusus URL (seperti `@`, `#`, atau `/`) harus di-encode. Ganti nilai contoh `JWT_SECRET` dengan string acak panjang; jangan gunakan nilai contoh untuk production. Isi `ADMIN_EMAIL` dan `TEAM_EMAIL` dengan email Google yang akan dipakai staf. `@example.com` pada template hanyalah placeholder, bukan akun untuk login.

### Buat database lokal

Di pgAdmin (ikut terpasang dengan PostgreSQL), klik kanan **Databases → Create → Database**, beri nama `rekapbaris`, lalu simpan. Atau buka SQL Shell (psql) dan jalankan:

```sql
CREATE USER rekapbaris WITH PASSWORD 'password-anda';
CREATE DATABASE rekapbaris OWNER rekapbaris;
```

Sesuaikan username/password pada `DATABASE_URL`. Jangan membuka port database lokal ke jaringan publik.

### Pasang dependensi dan jalankan
 
```powershell
npm install
npm run db:setup
npm run dev
```

Vite menampilkan alamat frontend (biasanya `http://localhost:5173`) dan Express API berjalan pada `http://localhost:3000`. Buka alamat Vite di browser. Untuk build production lokal:

```powershell
npm run build
npm start
```

`npm start` memerlukan database yang dapat diakses. Pemeriksaan cepat: buka `http://localhost:3000/api/health`; hasil sukses berisi `{"ok":true,...}`.

> `db:deploy` memakai `prisma db push` tanpa flag penghapusan data otomatis. Tetap buat backup sebelum perubahan skema, terutama pada database yang berisi data penting.

## 3. Konfigurasi Google OAuth

1. Di [Google Cloud Console](https://console.cloud.google.com/), pilih project dan konfigurasi OAuth consent screen serta domain aplikasi.
2. Buat **Credentials → Create Credentials → OAuth client ID → Web application**.
3. Untuk uji lokal tambahkan Authorized redirect URI:

   ```text
   http://localhost:3000/api/auth/google/callback
   ```

4. Salin Client ID dan Client Secret ke `GOOGLE_CLIENT_ID` dan `GOOGLE_CLIENT_SECRET` di `.env`.
5. `GOOGLE_CALLBACK_URL` harus sama persis dengan URI yang terdaftar. Saat production gunakan HTTPS, misalnya:

   ```text
   https://rekapbaris.com/api/auth/google/callback
   ```

Login dan pendaftaran menggunakan akun Google dengan email terverifikasi. Akun baru berstatus menunggu verifikasi Admin/Tim. Seed membuat akun staf aktif berdasarkan email yang dikonfigurasi; role staf tidak dapat dipilih dari formulir publik.

## 4. Midtrans QRIS

1. Salin **Server Key** dan **Client Key** Sandbox dari dashboard Midtrans ke `.env`.
2. Pastikan `MIDTRANS_IS_PRODUCTION=false` selama pengujian.
3. Setelah aplikasi dapat diakses publik melalui HTTPS, daftarkan URL notifikasi pada dashboard Midtrans:

   ```text
   https://rekapbaris.com/api/payments/midtrans/notification
   ```

4. Uji pembayaran berhasil, kedaluwarsa, pembatalan, stok produk, dan status transaksi dengan akun Sandbox.
5. Setelah akun production disetujui, ganti key Sandbox dengan key Production dan set `MIDTRANS_IS_PRODUCTION=true`. Jangan mencampur pasangan key Sandbox dan Production.

Server memvalidasi signature notifikasi dan jumlah pembayaran sebelum menandai transaksi lunas. Kunci rahasia tidak dikirim ke frontend.

## 5. Deploy ke VPS Biznet Gio — Ubuntu 22.04

### 5.1 Siapkan server dan domain

1. Buat VPS Ubuntu 22.04 pada Biznet Gio dan catat alamat IPv4 publiknya.
2. Pada pengelola DNS domain, arahkan record `A` untuk `rekapbaris.com` dan `www` ke IPv4 VPS. Tunggu propagasi DNS.
3. Masuk melalui SSH dari komputer:

   ```powershell
   ssh root@IP_VPS
   ```

4. Perbarui server dan pasang alat dasar:

   ```bash
   apt update && apt upgrade -y
   apt install -y git curl nginx postgresql postgresql-contrib build-essential
   ```

Aktifkan firewall hanya setelah aturan SSH dibuat. Buka SSH, HTTP, dan HTTPS; jangan membuka port PostgreSQL ke internet:

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

### 5.2 Pasang Node.js, PM2, dan PostgreSQL

Pasang Node.js LTS 20 melalui NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node --version
npm --version
npm install --global pm2
```

Buat database lokal di VPS:

```bash
sudo -u postgres createuser --pwprompt rekapbaris
sudo -u postgres createdb --owner=rekapbaris rekapbaris
```

Simpan password database dengan aman; gunakan di `DATABASE_URL`. Database lokal pada VPS tidak perlu diekspos ke internet.

### 5.3 Ambil aplikasi dan siapkan environment production

Buat direktori aplikasi, clone repositori, lalu pasang dependencies:

```bash
mkdir -p /var/www
cd /var/www
git clone https://github.com/maximumaziz-pixel/RekapBarisWeb.git
cd /var/www/RekapBarisWeb
npm ci
```

Buat file production tanpa menyalin secret ke repository:

```bash
cp .env.example .env
nano .env
```

Atur nilai production setidaknya seperti berikut:

```dotenv
PORT=3000
APP_URL=https://rekapbaris.com
COOKIE_SECURE=true
JWT_SECRET=<string-acak-rahasia-minimal-32-karakter>
DATABASE_URL=postgresql://rekapbaris:<password>@localhost:5432/rekapbaris?schema=public
GOOGLE_CALLBACK_URL=https://rekapbaris.com/api/auth/google/callback
MIDTRANS_IS_PRODUCTION=false
UPLOAD_DIR=/var/www/RekapBarisWeb/uploads
```

Isi juga kredensial Google, key Midtrans, nomor WhatsApp, `ADMIN_NAME`, `ADMIN_EMAIL`, `TEAM_NAME`, dan `TEAM_EMAIL`. Awali dengan Midtrans Sandbox; aktifkan production hanya sesudah uji dan verifikasi. Jangan menaruh tanda kurung sudut pada nilai sebenarnya. PM2 mengatur `NODE_ENV=production` dari `ecosystem.config.js`; jangan menaruh variabel itu di `.env` karena Vite mengatur mode build-nya sendiri. Batasi akses file konfigurasi:

```bash
chmod 600 .env
mkdir -p uploads
```

Tambahkan URL callback HTTPS di Google Cloud Console sebelum menguji login. Simpan `.env` dan cadangan database di lokasi privat yang aksesnya terbatas.

### 5.4 Siapkan database dan build

```bash
npm run db:generate
npm run db:deploy
npm run db:seed
npm run build
```

`db:seed` membuat atau memperbarui dua akun staf dari email environment. Jalankan seed lagi setelah mengubah email staf. Akun masuk melalui tombol Google menggunakan email yang sama.

### 5.5 Jalankan aplikasi dengan PM2

PM2 mengelola proses Node dan memulihkannya setelah restart:

```bash
pm2 startOrReload ecosystem.config.js --update-env
pm2 status
pm2 logs rekapbaris
pm2 save
pm2 startup
```

Jika `pm2 startup` mencetak sebuah perintah `sudo ...`, salin dan jalankan perintah yang dicetak itu sebagai root, lalu simpan daftar proses lagi:

```bash
pm2 save
```

Periksa aplikasi lokal di VPS dengan `curl http://127.0.0.1:3000/api/health`. Jangan membuka port 3000 pada firewall publik; Nginx akan meneruskan permintaan ke sana.

### 5.6 Pasang Nginx sebagai reverse proxy

Untuk memperoleh sertifikat pertama kali, siapkan konfigurasi HTTP sederhana:

```bash
cat > /etc/nginx/sites-available/rekapbaris <<'NGINX'
server {
    listen 80;
    server_name rekapbaris.com www.rekapbaris.com;
    client_max_body_size 10m;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX
ln -s /etc/nginx/sites-available/rekapbaris /etc/nginx/sites-enabled/rekapbaris
nginx -t
systemctl reload nginx
```

Hapus symlink default jika bentrok (`rm /etc/nginx/sites-enabled/default`), lalu pasang Certbot dan terbitkan sertifikat:

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d rekapbaris.com -d www.rekapbaris.com
```

Certbot meminta alamat email dan persetujuan. Setelah sertifikat terbit, sesuaikan `deploy/nginx/rekapbaris.conf` jika nama domain berbeda, lalu salin konfigurasi dan uji:

```bash
cp deploy/nginx/rekapbaris.conf /etc/nginx/sites-available/rekapbaris
nginx -t
systemctl reload nginx
certbot renew --dry-run
```

Konfigurasi repo mengarahkan HTTP ke HTTPS dan meneruskan traffic HTTPS ke Express pada port `3000`. Pastikan path sertifikat pada file cocok dengan domain di server.

### 5.7 Verifikasi, update, dan backup

- Buka `https://rekapbaris.com` dan `https://rekapbaris.com/api/health`.
- Uji login Google, dashboard staf, transaksi Sandbox, dan webhook dari dashboard Midtrans.
- Pantau `pm2 logs rekapbaris` dan `journalctl -u nginx`.
- Untuk pembaruan, masuk ke direktori aplikasi, ambil perubahan Git, jalankan `npm ci`, `npm run db:generate`, `npm run db:deploy`, `npm run build`, lalu `pm2 restart rekapbaris --update-env`.
- Backup PostgreSQL (contoh): `sudo -u postgres pg_dump rekapbaris > /lokasi-aman/rekapbaris.sql`. Backup juga folder uploads dan environment secara aman; jangan simpan backup di folder publik web.

## Pengelolaan file dan konfigurasi

- `public/logo.svg` dipakai sebagai logo navbar, ikon situs, dan watermark hero.
- Express melayani file statis dari `public/` dan hasil build `dist/`. Berkas dalam `UPLOAD_DIR` tersedia melalui `/uploads/`; file dapat diletakkan melalui SFTP/alat deployment. Endpoint upload belum disediakan, jadi jangan memberi akses tulis publik langsung ke server.
- Untuk mengubah desain Tailwind, edit `tailwind.config.js` dan `src/styles.css`; layout halaman berada di `src/App.jsx`.
- Toggle tema menyimpan pilihan browser. WhatsApp mengarah ke nomor `VITE_ADMIN_WHATSAPP`.
- Skema database PostgreSQL berada di `prisma/schema.prisma`. Salin `.env.example` hanya untuk membuat environment baru; jangan pernah menimpa `.env` production yang sudah berisi credential.

## Perintah pengembangan

```bash
npm run dev          # Vite + Express untuk development
npm run build        # Build frontend production
npm start             # Jalankan Express dan frontend hasil build
npm run check         # Syntax check backend dan seed
npm run db:validate   # Validasi schema Prisma
npm run db:generate   # Generate Prisma Client
npm run db:deploy     # Sinkronkan schema ke database
npm run db:seed       # Seed akun Admin dan Tim
```
