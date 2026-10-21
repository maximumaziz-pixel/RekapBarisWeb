# Rekap Baris

Platform manajemen event perlombaan, pendaftaran peserta, e-voting, e-ticketing, dan merchandise. Aplikasi memakai React + Vite + Tailwind CSS, Express, PostgreSQL, Prisma, Google OAuth 2.0, dan pembayaran QRIS Midtrans.

## Fitur

- Beranda responsif dengan tema biru-emas dan toggle mode terang/gelap.
- Direktori event dengan pencarian, filter status, dan pengurutan.
- Pendaftaran peserta yang dapat diverifikasi staf.
- E-voting, tiket penonton, dan merchandise melalui Midtrans Snap QRIS.
- Registrasi peran peserta, penyelenggara, dan juri; login email/nomor HP/password, reset password melalui WhatsApp, dan Google OAuth opsional.
- Dashboard terpisah untuk Admin, Tim Rekap, peserta, penyelenggara, dan juri dengan akses data sesuai role.
- Dashboard Admin/Tim untuk ringkasan, akun, event, peserta, pembayaran, serta stok/produk.
- Tombol chat WhatsApp Admin yang tersedia pada semua halaman.
- Express menyajikan UI, aset `public/`, dan berkas `UPLOAD_DIR` melalui `/uploads/`.

## Isi proyek

```text
RekapBarisWeb/
├── ttdj/.env.example        Template konfigurasi (tidak berisi secret)
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

   Proyek memerlukan Node.js 20 atau lebih baru (sebelum Node.js 25).
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
Copy-Item .\ttdj\.env.example .env
```

Buka `.env` di VS Code, lalu isi `DATABASE_URL`, `JWT_SECRET`, Google OAuth (opsional), Midtrans, nomor WhatsApp Admin/Tim (`ADMIN_PHONE`/`TEAM_PHONE`), `VITE_ADMIN_WHATSAPP` untuk tombol chat publik, serta nama, email, dan password Admin/Tim. `VITE_ADMIN_WHATSAPP` harus berupa digit nomor dengan kode negara tanpa tanda `+`, misalnya `62812...`. Contoh URL database lokal:

```text
DATABASE_URL="postgresql://rekapbaris:password-anda@localhost:5432/rekapbaris?schema=public"
```

Password yang mengandung karakter khusus URL (seperti `@`, `#`, atau `/`) harus di-encode. Ganti nilai contoh `JWT_SECRET` dengan string acak panjang; jangan gunakan nilai contoh untuk production. Isi `ADMIN_EMAIL` dan `TEAM_EMAIL` dengan email unik yang dikelola masing-masing staf, lalu atur `ADMIN_PASSWORD` dan `TEAM_PASSWORD` dengan password acak berbeda, minimal 8 karakter, dan mengandung huruf, angka, serta simbol. Nama dari `ADMIN_NAME` dan `TEAM_NAME` dapat dipakai sebagai username login staf. Nilai `@example.com` pada template hanyalah placeholder.

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
5. `GOOGLE_CALLBACK_URL` harus sama persis dengan URI yang terdaftar dan route aplikasi. Saat production gunakan HTTPS, misalnya:

   ```text
   https://rekapbaris.com/api/auth/google/callback
   ```

Pendaftaran meminta nama, email, nomor HP, dan asal satuan untuk peserta; data yang sama ditambah nama event untuk penyelenggara; juri mengisi nama, email, dan nomor HP. Password minimal 8 karakter serta wajib mengandung huruf, angka, dan simbol (spasi saja tidak dihitung sebagai simbol); password disimpan sebagai hash scrypt. Akun baru berstatus menunggu persetujuan Admin/Tim. Login mendukung email/nomor HP; Admin/Tim juga dapat memakai nama username dari environment. Google adalah pilihan login opsional untuk akun yang sudah terdaftar dengan email terverifikasi. Seed membuat akun staf aktif dengan password dari `ADMIN_PASSWORD` dan `TEAM_PASSWORD`; role staf tidak dapat dipilih dari formulir publik.

Lupa password mengirim reset ke nomor WhatsApp yang terdaftar. Respons dibuat generik agar nomor akun tidak dapat ditebak; token acak disimpan dalam bentuk hash, berlaku satu jam, hanya dapat digunakan sekali, dan sesi lama dicabut setelah reset. Nomor pengguna harus dapat menerima pesan WhatsApp. Dashboard peserta menampilkan pendaftaran dan transaksi miliknya; penyelenggara hanya melihat event miliknya; juri melihat event approved pada satuannya (atau semua event approved jika asal satuan kosong). Penugasan juri saat ini dikelola terpisah oleh Tim Rekap.

Jika Google menampilkan `401: invalid_client`, periksa Client ID dan Client Secret dari OAuth client **Web application** yang sama. Pastikan secret tidak kedaluwarsa/terhapus, `GOOGLE_CALLBACK_URL` sama persis dengan Authorized redirect URI (termasuk `/api/auth/google/callback`), dan restart proses Node/PM2 sesudah mengubah `.env`. Error ini umumnya menandakan kredensial client tidak valid; ketidaksesuaian callback biasanya dilaporkan Google sebagai `redirect_uri_mismatch`.

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
cp ttdj/.env.example .env
nano .env
```

Atur nilai production setidaknya seperti berikut. Buat `ADMIN_EMAIL` dan `TEAM_EMAIL` berbeda, serta isi kedua password staf dengan rahasia unik minimal 8 karakter yang mengandung huruf, angka, dan simbol:

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

Isi juga key Midtrans, nomor WhatsApp, `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `TEAM_NAME`, `TEAM_EMAIL`, dan `TEAM_PASSWORD`. Password Admin/Tim wajib berbeda, minimal 8 karakter, dan mengandung huruf, angka, serta simbol. Kredensial Google opsional untuk login email/password, tetapi harus benar jika tombol Google ingin digunakan. Awali dengan Midtrans Sandbox; aktifkan production hanya sesudah uji dan verifikasi. Jangan menaruh tanda kurung sudut pada nilai sebenarnya. PM2 mengatur `NODE_ENV=production` dari `ecosystem.config.js`; jangan menaruh variabel itu di `.env` karena Vite mengatur mode build-nya sendiri. Batasi akses file konfigurasi:

Untuk fitur lupa password, proyek memakai **Fonnte API**. Buat/siapkan perangkat WhatsApp di akun Fonnte dan pastikan perangkat terhubung, lalu ambil token API dari dashboard Fonnte. Pesan reset dikirim langsung ke nomor WhatsApp akun dengan tautan bertoken acak yang berlaku 60 menit; integrasi ini tidak memerlukan template pesan Meta.

Simpan token hanya di `.env` server; jangan pernah memakai awalan `VITE_`, memasukkan token ke Git, atau membagikannya:

```dotenv
ADMIN_PHONE=+6281111111111
TEAM_PHONE=+6282222222222
FONNTE_TOKEN=<token-api-dari-dashboard-fonnte>
```

Ganti placeholder token dengan token dari dashboard Fonnte di `.env` VPS, bukan di `.env.example`. API memakai endpoint `https://api.fonnte.com/send` dengan token pada header `Authorization`; nomor dikirim dalam format internasional tanpa tanda `+`, serta `countryCode=0` agar Fonnte tidak mengubah kode negaranya. Pesan berisi nama pengguna dan tautan `APP_URL/?resetToken=...`; Fonnte harus menerima pesan dan melaporkan `status: true` agar permintaan dianggap berhasil.

Fonnte adalah gateway pihak ketiga, jadi tinjau ketentuan dan metode koneksi yang berlaku di akun Anda. Gunakan nomor WhatsApp khusus layanan, aktifkan keamanan akun, batasi akses token, serta jangan kirim pesan yang tidak diminta. Uji ke nomor sendiri terlebih dahulu. Hindari mengandalkan nomor pribadi yang penting untuk operasional karena sesi/perangkat gateway dapat terputus atau penggunaan yang melanggar kebijakan WhatsApp dapat menimbulkan pembatasan akun. Jangan kirim token API atau token reset ke log. Jika Fonnte tidak dikonfigurasi, endpoint memberi error konfigurasi; jika pengiriman gagal, server mencatat kegagalan dan menghapus token reset yang belum terkirim. Respons publik tetap generik untuk mencegah enumerasi nomor akun.

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

`db:seed` membuat atau memperbarui dua akun staf aktif, termasuk hash password scrypt dari environment. Jalankan seed lagi setelah mengubah email, nama username, atau password staf. Akun Admin/Tim dapat masuk menggunakan email atau nama yang dikonfigurasi dan password. Jangan gunakan email yang sama untuk Admin dan Tim.

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
- Uji registrasi per role, persetujuan Admin/Tim, login dengan email/nomor HP, serta lupa password via Fonnte ke nomor uji sebelum produksi, dashboard role, transaksi Sandbox, dan webhook dari dashboard Midtrans.
- Pantau `pm2 logs rekapbaris` dan `journalctl -u nginx`.
- Untuk pembaruan manual, ikuti langkah di bagian **Pembaruan manual ke VPS** di bawah.
- Backup PostgreSQL (contoh): `sudo -u postgres pg_dump rekapbaris > /lokasi-aman/rekapbaris.sql`. Backup juga folder uploads dan environment secara aman; jangan simpan backup di folder publik web.

## Pengelolaan file dan konfigurasi

- `public/logo.svg` dipakai sebagai logo navbar, ikon situs, dan watermark hero.
- Express melayani file statis dari `public/` dan hasil build `dist/`. Berkas dalam `UPLOAD_DIR` tersedia melalui `/uploads/`; file dapat diletakkan melalui SFTP/alat deployment. Endpoint upload belum disediakan, jadi jangan memberi akses tulis publik langsung ke server.
- Untuk mengubah desain Tailwind, edit `tailwind.config.js` dan `src/styles.css`; layout halaman berada di `src/App.jsx`.
- Toggle tema menyimpan pilihan browser. Tombol WhatsApp mengarah ke nomor Admin `VITE_ADMIN_WHATSAPP`; klik balon hijau untuk membuka kartu chat, lalu pilih **Mulai chat WhatsApp**.
- Skema database PostgreSQL berada di `prisma/schema.prisma`. Salin `ttdj/.env.example` hanya untuk membuat environment baru; jangan pernah menimpa `.env` production yang sudah berisi credential.

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
npm run test:auth     # Uji hash dan verifikasi password
```

## Langkah pembaruan aplikasi di VPS

Jalankan langkah ini setelah perubahan sudah di-commit dan di-push ke branch `main` pada GitHub. Dari SSH terminal VPS:

```bash
cd /var/www/RekapBarisWeb
git status --short
```

Jika ada perubahan lokal yang belum disimpan, berhenti dan tinjau atau cadangkan terlebih dahulu; jangan menimpa `.env` production. Pastikan `.env` VPS berisi `ADMIN_PASSWORD` dan `TEAM_PASSWORD` yang berbeda (masing-masing minimal 8 karakter serta mengandung huruf, angka, dan simbol), `ADMIN_PHONE` dan `TEAM_PHONE` yang valid dan berbeda, serta `FONNTE_TOKEN`. Pastikan alamat email Admin dan Tim juga berbeda. Jika bersih dan konfigurasi sudah siap, lanjutkan:

```bash
set -e
umask 077
backup="$HOME/rekapbaris-$(date +%F-%H%M%S).sql"
sudo -u postgres pg_dump rekapbaris > "$backup"
test -s "$backup"
git pull --ff-only origin main
npm ci
npm run db:generate
npm run db:deploy
npm run db:seed
npm run build
pm2 restart rekapbaris --update-env
curl -fsS http://127.0.0.1:3000/api/health
```

Perintah dump menyimpan cadangan database di home direktori pengguna SSH sebelum pembaruan skema; `umask 077` membatasi akses file cadangan. `set -e` dan `test -s` menghentikan proses jika backup gagal atau kosong. `db:seed` memperbarui akun staf dan hash password dari `.env`. Setelah health check berhasil, buka `https://rekapbaris.com` dan muat ulang paksa browser. Jika aplikasi belum pulih, periksa `pm2 status` dan `pm2 logs rekapbaris --lines 100`; jangan menghapus atau mengganti `.env` production.

## Automated deploy ke VPS melalui GitHub Actions

Repository menyertakan workflow [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml). Workflow berjalan otomatis saat commit di-push ke `main`, atau dapat dijalankan manual dari tab **Actions → Deploy to VPS → Run workflow**. Workflow membuat backup database, mengambil commit terbaru, memasang dependency, menerapkan schema, seed akun staf, build frontend, restart PM2, lalu memeriksa health endpoint.

Siapkan VPS terlebih dahulu: aplikasi harus berada di `/var/www/RekapBarisWeb`, branch `main` harus clean, akun deploy dapat menjalankan `sudo -u postgres pg_dump rekapbaris` tanpa prompt, Node/npm, Git, PostgreSQL, dan PM2 tersedia, dan `.env` production telah diisi lengkap. Tambahkan GitHub repository secrets berikut melalui **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Isi |
| --- | --- |
| `DEPLOY_HOST` | IP atau hostname VPS |
| `DEPLOY_USER` | User SSH deploy |
| `DEPLOY_SSH_KEY` | Private SSH key khusus deployment |
| `DEPLOY_KNOWN_HOSTS` | Host key VPS yang fingerprint-nya sudah diverifikasi |

Batasi SSH key ke akses yang diperlukan, lindungi secrets, dan jangan gunakan `StrictHostKeyChecking=no`. Commit ke `main` akan menjalankan deploy; log dan hasilnya terlihat pada tab **Actions**. Jika workflow berhenti karena worktree VPS berubah, periksa perubahan tersebut secara manual dan jangan menghapusnya tanpa inspeksi.

## Pembaruan manual ke VPS

Setelah commit di-push ke `main`, sambungkan ke VPS via SSH dan pastikan `.env` production tidak ditimpa. Akun staf wajib punya email, nomor WhatsApp, dan password yang berbeda; password minimal 8 karakter serta mengandung huruf, angka, dan simbol. `FONNTE_TOKEN` yang valid diperlukan agar tautan reset dapat terkirim.

```bash
cd /var/www/RekapBarisWeb
git status --short
```

Jika worktree bersih, jalankan pembaruan berikut:

```bash
set -e
umask 077
backup="$HOME/rekapbaris-$(date +%F-%H%M%S).sql"
sudo -u postgres pg_dump rekapbaris > "$backup"
test -s "$backup"
git pull --ff-only origin main
npm ci
npm run db:generate
npm run db:deploy
npm run db:seed
npm run build
pm2 restart rekapbaris --update-env
curl -fsS http://127.0.0.1:3000/api/health
```

Jangan lanjut jika `git status` menunjukkan perubahan yang tidak dikenal atau backup gagal. Setelah health check berhasil, uji login, pendaftaran, reset email, dan dashboard sesuai role. Periksa `pm2 logs rekapbaris --lines 100` bila ada error.
