# Rekap Baris

Rekap Baris adalah aplikasi manajemen event perlombaan: pendaftaran peserta, penilaian dan klasemen, e-voting, e-ticketing, serta merchandise. Frontend memakai React dan Vite; backend memakai Express; database memakai PostgreSQL melalui Prisma.

README ini menjelaskan setup dari komputer baru, menjalankan aplikasi, deploy manual ke VPS Biznet Gio Ubuntu 22.04, serta memperbarui aplikasi tanpa menimpa perubahan lokal atau file konfigurasi.

## Ringkasan Proyek

- `server.js` menjalankan API Express, autentikasi, OAuth, pembayaran, dan file statis.
- `src/` berisi aplikasi React. Dalam development, Vite berjalan di port `5173` dan meneruskan `/api` ke Express di port `3000`.
- `prisma/schema.prisma` adalah skema PostgreSQL saat ini.
- `npm run db:deploy` menjalankan `prisma db push`; perintah ini menyinkronkan skema Prisma ke database dan bukan `prisma migrate deploy`.
- Folder `prisma/migrations/` berisi SQL historis. Scripts proyek saat ini tidak menjalankan folder itu. Jangan menjalankan migrasi historis secara manual pada database aktif tanpa rencana dan backup.
- `npm run db:seed` membuat atau memperbarui akun Admin dan Tim dari environment.
- `.env` menyimpan rahasia dan tidak boleh masuk Git. `ttdj/.env.example` adalah template lokal.
- `uploads/` menyimpan poster dan berkas unggahan; folder ini terpisah dari database dan harus dibackup sendiri.

## Persiapan Komputer Lokal

Untuk Windows, gunakan PowerShell atau terminal VS Code.

1. Pasang Node.js 20 LTS. `package.json` mendukung Node.js `>=20 <25`.
2. Pasang Git.
3. Pasang PostgreSQL 15 atau 16 dan pastikan layanan PostgreSQL berjalan. pgAdmin boleh digunakan untuk membuat database.
4. Pasang VS Code bila belum tersedia.

Periksa instalasi:

```powershell
node --version
npm --version
git --version
psql --version
```

## Mulai dari Clone Baru

Jika repository belum ada di komputer:

```powershell
git clone https://github.com/maximumaziz-pixel/RekapBarisWeb.git
Set-Location .\RekapBarisWeb
code .
```

Jika folder proyek sudah tersedia, buka folder itu dan lanjutkan. Jangan menghapus folder lama sebelum membackup perubahan kode, `.env`, dan `uploads/` yang masih diperlukan.

### 1. Buat database lokal

Di pgAdmin, buat user PostgreSQL dan database, atau jalankan di SQL Shell/psql sebagai user yang memiliki hak membuat role dan database:

```sql
CREATE USER rekapbaris WITH PASSWORD 'GANTI_DENGAN_PASSWORD_LOKAL';
CREATE DATABASE rekapbaris OWNER rekapbaris;
```

Gunakan password database yang berbeda dari password akun aplikasi. Jangan membuka port PostgreSQL ke internet. Jika user atau database sudah ada, jangan menjalankan perintah `CREATE` lagi; periksa database yang tersedia terlebih dahulu.

### 2. Buat environment lokal

Di PowerShell, salin template hanya jika `.env` belum ada:

```powershell
if (!(Test-Path .\.env)) { Copy-Item .\ttdj\.env.example .\.env } else { Write-Error ".env sudah ada; jangan menimpanya." }
```

Buka `.env` dan ganti placeholder. Untuk development lokal, pertahankan:

```dotenv
PORT=3000
APP_URL=http://localhost:3000
COOKIE_SECURE=false
DATABASE_URL=postgresql://rekapbaris:PASSWORD_LOKAL@localhost:5432/rekapbaris?schema=public
MIDTRANS_IS_PRODUCTION=false
```

`JWT_SECRET` wajib berisi rahasia acak minimal 32 karakter. `DATABASE_URL` harus mengarah ke database lokal yang baru dibuat. Encode karakter khusus pada password database sebagai URL encoding, atau gunakan password yang aman dan mudah direpresentasikan dalam URL.

| Environment | Wajib | Catatan |
| --- | --- | --- |
| `DATABASE_URL` | Ya | PostgreSQL lokal; periksa nama host dan database sebelum reset atau seed. |
| `JWT_SECRET` | Ya | Minimal 32 karakter acak. Jangan gunakan nilai contoh di production. |
| `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PHONE`, `ADMIN_PASSWORD` | Ya untuk seed | Data akun Admin. |
| `TEAM_NAME`, `TEAM_EMAIL`, `TEAM_PHONE`, `TEAM_PASSWORD` | Ya untuk seed | Harus berbeda dari akun Admin. Nomor telepon juga harus berbeda dan valid. Password minimal 8 karakter dengan huruf, angka, dan simbol. |
| `APP_URL`, `COOKIE_SECURE` | Ya untuk login lokal yang benar | Lokal: `http://localhost:3000` dan `false`. Production HTTPS: URL domain dan `true`. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` | Opsional | Untuk Google OAuth. Callback lokal: `http://localhost:3000/api/auth/google/callback`. Daftarkan URL yang sama persis di Google Cloud. |
| `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, `MIDTRANS_IS_PRODUCTION` | Opsional | Gunakan key Sandbox dan `false` untuk pengujian. |
| `FONNTE_TOKEN` | Opsional | Diperlukan agar reset password dapat dikirim melalui Fonnte. Simpan hanya di `.env` server. |
| `ADMIN_PHONE`, `TEAM_PHONE` | Seed dan kontak | Nomor staf dalam format internasional. Masing-masing harus berbeda. |
| `VITE_ADMIN_WHATSAPP` | Opsional | Nomor tombol chat publik, digit dengan kode negara tanpa tanda `+`. |
| `UPLOAD_DIR` | Opsional | Default-nya folder `uploads/` pada root proyek. Pastikan dapat ditulis oleh proses Node. |

Jangan menaruh secret server di variabel `VITE_*`; variabel tersebut dapat dimasukkan ke bundle frontend. Jangan mengunggah `.env`, key pembayaran, token Fonnte, atau backup database ke Git.

### 3. Install dan jalankan

Gunakan lockfile repository untuk instalasi yang konsisten:

```powershell
npm ci
npm run db:validate
npm run db:setup
npm run dev
```

`db:setup` menjalankan generate Prisma Client, `prisma db push`, lalu seed akun staf. Gunakan pada database lokal kosong atau database yang memang sudah dibackup dan disetujui untuk disinkronkan. Seed akan membuat/memperbarui akun Admin dan Tim sesuai `.env`.

Saat `npm run dev` berjalan, buka `http://localhost:5173`. API Express berjalan di `http://localhost:3000`; pemeriksaan health tersedia di `http://localhost:3000/api/health`. Hentikan proses development dengan `Ctrl+C`.

Perintah pemeriksaan lain:

```powershell
npm run build
npm run check
npm run test:auth
```

`npm start` menjalankan Express dan membutuhkan build frontend (`npm run build`) serta database yang dapat diakses.

`start.sh` adalah wrapper shell untuk setup/start Linux: script menjalankan install, generate, `db push`, seed, build, lalu prune development dependencies dan memulai PM2 atau `npm start`. Script ini bukan reset dan bukan deployment yang aman untuk dijalankan tanpa meninjau target `DATABASE_URL`; jangan gunakan sebagai shortcut pada database production yang belum dibackup.

### Jika instalasi npm lama atau gagal

`prisma` dan `@prisma/client` dipatok di `package.json` pada versi yang sama, yaitu `6.19.0`. Clone baru cukup memakai `npm ci`; jangan menambahkan Prisma lagi dengan versi terbaru secara bebas. Instalasi pertama dapat mengunduh engine Prisma sehingga lamanya dipengaruhi koneksi registry npm, akses ke server unduhan engine, cache, dan pemindaian antivirus Windows.

Jika tidak ada kemajuan selama beberapa menit, buka terminal lain dan periksa apakah masih ada proses npm aktif. Setelah memastikan proses install yang macet sudah dihentikan, coba:

```powershell
npm ping
npm cache verify
npm ci --verbose
```

Jangan hapus `package-lock.json` untuk mengatasi install lambat. `npm ci` membangun ulang `node_modules` sesuai lockfile dan dapat menghapus folder `node_modules` lama, tetapi tidak menghapus database, `.env`, atau `uploads/`. Saat meminta bantuan, bagikan bagian akhir error; hapus token, URL database, dan credential dari log terlebih dahulu.

## Integrasi Opsional

### Google OAuth

Buat OAuth Client ID bertipe **Web application** di Google Cloud. Daftarkan callback yang persis sama dengan `GOOGLE_CALLBACK_URL`:

```text
Lokal:      http://localhost:3000/api/auth/google/callback
Production: https://rekapbaris.com/api/auth/google/callback
```

Isi Client ID dan Client Secret di `.env`, kemudian restart server. Google OAuth tidak diperlukan untuk login email/password.

### Midtrans

Mulai dengan Server Key dan Client Key Sandbox serta `MIDTRANS_IS_PRODUCTION=false`. Setelah domain publik memakai HTTPS, pasang URL notifikasi berikut di dashboard Midtrans:

```text
https://rekapbaris.com/api/payments/midtrans/notification
```

Gunakan key production hanya setelah akun production aktif dan pengujian selesai. Jangan mencampur key Sandbox dan Production. Server memvalidasi signature notifikasi sebelum menyimpan status pembayaran berhasil.

### Reset password WhatsApp

Fitur ini menggunakan Fonnte. Isi `FONNTE_TOKEN` di `.env` server dan pastikan perangkat/akun pengirim aktif. Jangan memakai token pada frontend atau membagikannya. Pengiriman dan kebijakan layanan bergantung pada akun Fonnte.

## Deploy Manual ke VPS Biznet Gio

Instruksi ini untuk VPS Ubuntu 22.04, domain `rekapbaris.com`, PostgreSQL lokal di VPS, Nginx, dan PM2. Sesuaikan domain, alamat email, dan path jika berbeda. Simpan salinan `.env` serta backup di lokasi privat.

### 1. Siapkan VPS

Arahkan DNS record `A` untuk domain dan `www` ke IPv4 VPS. Masuk melalui SSH, lalu pasang paket dasar:

```bash
apt update && apt upgrade -y
apt install -y git curl nginx postgresql postgresql-contrib build-essential
```

Pasang Node.js 20 dan PM2:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
npm install --global pm2
node --version
npm --version
```

Buat user database dan database aplikasi sekali saja:

```bash
sudo -u postgres createuser --pwprompt rekapbaris
sudo -u postgres createdb --owner=rekapbaris rekapbaris
```

Jangan membuka port PostgreSQL atau port aplikasi `3000` ke internet. Firewall publik cukup membuka SSH, HTTP, dan HTTPS setelah aturan SSH dipastikan:

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

### 2. Ambil kode dan konfigurasi production

Clone repository dan install dependencies:

```bash
mkdir -p /var/www
cd /var/www
git clone https://github.com/maximumaziz-pixel/RekapBarisWeb.git
cd /var/www/RekapBarisWeb
npm ci
cp ttdj/.env.example .env
nano .env
```

Ganti semua placeholder. Minimal, environment production harus setara dengan konfigurasi berikut:

```dotenv
PORT=3000
APP_URL=https://rekapbaris.com
COOKIE_SECURE=true
JWT_SECRET=GANTI_DENGAN_SECRET_ACAK_MINIMAL_32_KARAKTER
DATABASE_URL=postgresql://rekapbaris:PASSWORD_DATABASE@localhost:5432/rekapbaris?schema=public
GOOGLE_CALLBACK_URL=https://rekapbaris.com/api/auth/google/callback
MIDTRANS_IS_PRODUCTION=false
UPLOAD_DIR=/var/www/RekapBarisWeb/uploads
```

Isi juga data Admin dan Tim yang berbeda, key Midtrans Sandbox, nomor WhatsApp, `VITE_ADMIN_WHATSAPP`, serta `FONNTE_TOKEN` bila fitur terkait digunakan. Simpan password database dengan URL encoding bila mengandung karakter khusus. Jangan menyalin nilai lokal `COOKIE_SECURE=false` ke production. PM2 mengatur `NODE_ENV=production` lewat `ecosystem.config.js`.

Batasi akses file dan siapkan direktori unggahan:

```bash
chmod 600 .env
mkdir -p uploads
```

### 3. Siapkan database dan build aplikasi

Jalankan hanya pada database baru atau setelah backup dan peninjauan perubahan skema:

```bash
npm run db:validate
npm run db:generate
npm run db:deploy
npm run db:seed
npm run build
```

`db:deploy` memakai `prisma db push`. Periksa `prisma/schema.prisma` dan dampak perubahan sebelum menjalankannya terhadap database yang berisi data. `db:seed` mengatur dua akun staf dari environment; jangan memakai placeholder, email/nomor yang sama, atau password yang sama.

### 4. Jalankan dengan PM2

```bash
pm2 startOrReload ecosystem.config.js --update-env
pm2 status
pm2 save
pm2 startup
```

Jalankan perintah `sudo ...` yang dicetak oleh `pm2 startup`, lalu jalankan `pm2 save` lagi. Periksa API langsung di VPS:

```bash
curl -fsS http://127.0.0.1:3000/api/health
```

### 5. Nginx dan HTTPS

Konfigurasi HTTPS di `deploy/nginx/rekapbaris.conf` mengharapkan sertifikat Let's Encrypt sudah tersedia. Untuk permintaan sertifikat pertama, buat site HTTP sementara:

```bash
cat > /etc/nginx/sites-available/rekapbaris <<'NGINX'
server {
    listen 80;
    listen [::]:80;
    server_name rekapbaris.com www.rekapbaris.com;
    client_max_body_size 10m;
    location / {
        proxy_pass http://127.0.0.1:3000;
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

Jika site default Nginx bentrok, periksa konfigurasi sebelum menonaktifkan symlink default. Lalu pasang sertifikat:

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d rekapbaris.com -d www.rekapbaris.com
```

Setelah sertifikat terbit, salin konfigurasi HTTPS dari repository (sesuaikan `server_name` dan path sertifikat bila domain berbeda), lalu periksa dan reload Nginx:

```bash
cp deploy/nginx/rekapbaris.conf /etc/nginx/sites-available/rekapbaris
nginx -t
systemctl reload nginx
certbot renew --dry-run
```

Buka `https://rekapbaris.com` dan `https://rekapbaris.com/api/health`. Nginx meneruskan request ke Express di port `3000`; jangan buka port itu secara publik.

## Pembaruan Tanpa Menimpa Perubahan

Gunakan Git untuk memperbarui source. Jangan menyalin seluruh folder proyek lama ke folder baru atau mengekstrak ZIP di atas checkout yang sudah ada. File `.env` dan `uploads/` diabaikan Git; simpan keduanya di folder project dan jangan menghapusnya saat memperbarui kode.

### Pembaruan lokal melalui VS Code

1. Simpan pekerjaan yang sedang berjalan. Di setiap terminal VS Code yang menjalankan aplikasi (`npm run dev`, Vite, atau server), tekan `Ctrl+C` dan tunggu sampai proses berhenti. Tutup terminal lain yang masih menjalankan server dari folder project ini. Ini mencegah file dependency Windows seperti `esbuild.exe` terkunci saat `npm ci`.
2. Buka **Source Control** di VS Code dan tinjau semua perubahan, termasuk file baru. Commit perubahan yang ingin dipertahankan, atau buat backup/stash yang sudah dipastikan aman. Jangan lanjut bila ada perubahan yang belum dipahami atau belum diamankan.
3. Buka terminal **PowerShell** baru di root project. Periksa branch dan status:

    ```powershell
    git status --short
    git branch --show-current
    ```

   Lanjut hanya jika branch adalah `main` dan `git status --short` tidak menampilkan apa pun. Jika branch berbeda atau status menampilkan file, berhenti dan tinjau perubahan itu terlebih dahulu. Jangan gunakan `git reset`, force pull, atau menghapus file untuk memaksa proses.
4. Ambil pembaruan. Jika perintah gagal atau menampilkan konflik, berhenti dan selesaikan penyebabnya sebelum melanjutkan:

    ```powershell
    git pull --ff-only origin main
    ```

   `--ff-only` mencegah Git membuat merge yang tidak diharapkan. Jika gagal karena branch lokal tertinggal dengan commit lokal atau riwayat berbeda, jangan paksa; minta bantuan untuk meninjau riwayatnya.
5. Setelah pull berhasil, pasang dependency dan jalankan pemeriksaan satu per satu. Lanjut ke perintah berikutnya hanya bila perintah sebelumnya berhasil:

    ```powershell
    npm ci
    ```

    ```powershell
    npm run db:validate
    ```

    ```powershell
    npm run db:generate
    ```

    ```powershell
    npm run build
    ```

   Jika `npm ci` gagal dengan `EPERM` atau pesan bahwa file sedang dipakai (sering pada `node_modules\\@esbuild\\win32-x64\\esbuild.exe`), jangan langsung menjalankannya sebagai Administrator atau menghapus file secara manual. Pastikan semua server/terminal project sudah berhenti, tutup proses Vite/Node project yang masih aktif melalui VS Code atau Task Manager, tunggu antivirus menyelesaikan pemindaian bila sedang berlangsung, lalu coba `npm ci` lagi. Jika tetap gagal, restart Windows dan ulangi `npm ci` sebelum membuka server development. Untuk error lain, baca file log yang ditunjukkan npm dan selesaikan penyebabnya sebelum lanjut.

`npm ci` memasang dependency sesuai `package-lock.json` dan mengganti isi `node_modules`; perintah ini tidak mengubah `.env`, database PostgreSQL, atau `uploads/`. Jangan menghapus `package-lock.json` atau menggantinya dengan `npm install` sebagai jalan pintas.

Jika pembaruan mengubah `prisma/schema.prisma`, tinjau perubahan skema dahulu dan backup database lokal lewat pgAdmin sebelum menjalankan `npm run db:deploy`. `db:deploy` menjalankan `prisma db push` dan dapat mengubah struktur database; pastikan `.env` menunjuk ke database lokal sebelum menjalankannya. Jangan jalankan `npm run db:setup` untuk pembaruan rutin karena perintah itu juga menjalankan seed akun staf.

6. Setelah semua pemeriksaan berhasil, jalankan kembali `npm run dev` dari terminal VS Code dan periksa aplikasi di `http://localhost:5173`. Biarkan terminal itu tetap terbuka selama aplikasi digunakan.

### Commit perubahan lokal ke GitHub

Ulangi alur ini dari folder repository **setiap project** yang ingin diperbarui. Pastikan terminal berada di root repository yang benar; satu commit hanya berisi perubahan pada repository tersebut. Commit menyimpan perubahan di komputer lokal, `git push` mengirim commit ke GitHub, dan langkah deploy VPS di bawah mengambil commit tersebut ke server.

1. Pastikan folder, branch, dan remote yang dituju sudah benar:

    ```powershell
    Get-Location
    git remote -v
    git branch --show-current
    git status --short
    ```

   Pastikan `Get-Location` menunjukkan folder project yang dimaksud dan remote `origin` menunjuk ke repository GitHub yang benar. Perintah berikut mengasumsikan branch target bernama `main`. Jika branch berbeda, ganti `main` dengan nama branch yang benar di seluruh langkah.
2. Tinjau semua perubahan yang akan dimasukkan, termasuk file baru dan file yang dihapus. Jangan lanjut bila ada perubahan yang tidak Anda kenali:

    ```powershell
    git diff
    git status --short
    ```

   Periksa juga file baru yang belum dilacak dari daftar `git status --short`. Jangan commit `.env`, token/password, backup database, log, atau data pribadi. `.env` dan `uploads/` seharusnya diabaikan Git.
3. Jika memang ingin memasukkan **semua perubahan dalam repository ini**, stage semuanya dari root project:

    ```powershell
    git add -A
    git status --short
    git diff --cached --stat
    git diff --cached
    ```

   `git add -A` memasukkan perubahan file terlacak, file baru, dan penghapusan; file yang diabaikan oleh `.gitignore` tidak ikut. Cermati `git diff --cached` sebelum commit. Jika ada file yang tidak ingin dikirim, keluarkan file tersebut dari staging, lalu tinjau ulang:

    ```powershell
    git restore --staged path\ke\file
    ```

4. Commit seluruh perubahan yang sudah ditinjau. Ubah pesan agar menjelaskan isi perubahan:

    ```powershell
    git commit -m "Jelaskan perubahan project"
    ```

   Jika Git menjawab `nothing to commit`, tidak ada perubahan staged untuk dibuat menjadi commit. Jika Git meminta identitas, atur nama dan email commit untuk repository ini lalu ulangi:

    ```powershell
    git config user.name "Nama Anda"
    git config user.email "email-anda@example.com"
    ```

5. Pastikan commit tercatat, lalu push semua commit lokal pada branch aktif ke branch `main` di GitHub:

    ```powershell
    git log -1 --oneline
    git status --short
    git push origin main
    ```

   Jika branch aktif bukan `main`, push branch tersebut dengan `git push -u origin nama-branch`, lalu buat Pull Request ke `main` di GitHub. VPS yang mengikuti `main` baru mendapat perubahan setelah Pull Request digabungkan. Jika push ditolak karena GitHub memiliki commit baru, jangan force-push; sinkronkan dan tinjau riwayat terlebih dahulu, lalu push kembali.

### Pembaruan VPS

Setelah push berhasil ke `main` (atau Pull Request sudah digabungkan), update **setiap VPS/project** yang ingin menerima perubahan tersebut dengan menjalankan langkah ini pada checkout dan server project yang sesuai. Push ke GitHub tidak otomatis memperbarui VPS kecuali repository tersebut sudah disiapkan dengan pipeline deployment otomatis. `git pull --ff-only` mengambil seluruh commit terbaru dari remote branch; semua file terlacak yang berubah dalam commit tersebut ikut diperbarui, bukan hanya file README atau file yang disebut satu per satu.

Login melalui SSH dan periksa checkout sebelum mengubah file:

```bash
cd /var/www/RekapBarisWeb
git status --short
git branch --show-current
git remote -v
```

Pastikan folder, remote `origin`, dan branch (`main`) cocok dengan project yang hendak dideploy. Jika `git status --short` menampilkan perubahan lokal, berhenti dan tinjau/simpan perubahan tersebut sebelum lanjut. Jangan menjalankan `git reset`, force pull, atau menyalin checkout baru di atas folder yang sedang dipakai.

Sebelum update, pastikan `.env` dan `uploads/` tetap berada di folder aplikasi. Buat backup database di luar folder project sebelum perubahan skema. Untuk update kode rutin yang tidak mengubah skema, jalankan perintah berikut melalui SSH:

```bash
set -e
git pull --ff-only origin main
npm ci
npm run db:validate
npm run db:generate
npm run build
pm2 restart rekapbaris --update-env
curl -fsS http://127.0.0.1:3000/api/health
```

Perintah di atas mengasumsikan perubahan sudah ada di `origin/main`, folder checkout VPS berada pada branch `main`, dan PM2 memakai nama proses `rekapbaris`. Ganti path folder dan nama proses jika project/VPS Anda berbeda. `npm ci` memasang ulang dependency tepat dari lockfile; `.env` dan `uploads/` yang tidak dilacak Git tetap ada. Jangan menjalankan rangkaian tersebut jika `git status --short` menunjukkan perubahan lokal.

Jika skema berubah, buat backup database terlebih dahulu, tinjau file `prisma/schema.prisma`, lalu jalankan `npm run db:deploy` secara terpisah sebelum build/restart. `db:deploy` memakai `prisma db push`, bukan migrasi terkontrol; jangan jalankan otomatis tanpa meninjau dampaknya dan memastikan `DATABASE_URL` di VPS menunjuk ke database production yang benar. Jalankan `npm run db:seed` hanya bila memang perlu memperbarui akun Admin/Tim dari environment. Jika health check gagal, periksa `pm2 status`, `pm2 logs rekapbaris --lines 100`, dan `journalctl -u nginx` sebelum mencoba update lagi.

## Perintah Proyek

| Perintah | Fungsi |
| --- | --- |
| `npm ci` | Install persis berdasarkan `package-lock.json`. |
| `npm run dev` | Jalankan Vite dan Express untuk development. |
| `npm run build` | Build frontend ke `dist/`. |
| `npm start` | Jalankan Express untuk deployment/build lokal. |
| `npm run check` | Pemeriksaan sintaks JavaScript yang ditentukan di package scripts. |
| `npm run test:auth` | Jalankan test Node untuk autentikasi, rate limit, Midtrans, WhatsApp, dan scoring. |
| `npm run db:validate` | Validasi skema Prisma. |
| `npm run db:generate` | Generate Prisma Client. |
| `npm run db:deploy` | Jalankan `prisma db push`; tinjau sebelum database berisi data. |
| `npm run db:seed` | Buat/perbarui akun Admin dan Tim dari environment. |
| `npm run db:setup` | Generate client, sinkronkan skema, lalu seed akun staf. Umumnya dipakai saat setup awal. |

## Upload dan File

Express menyajikan frontend hasil build dan `public/`. Poster event disimpan di `UPLOAD_DIR` (default `uploads/`) dan dilayani melalui `/uploads/`. Backup folder upload secara terpisah dari PostgreSQL. Jangan letakkan file backup atau `.env` di folder publik.

## Ringkasan Tutorial

1. Pasang Node.js 20, Git, PostgreSQL, dan VS Code; clone repository lalu buka foldernya di VS Code.
2. Buat database PostgreSQL lokal, salin `ttdj/.env.example` menjadi `.env`, lalu isi `DATABASE_URL`, `JWT_SECRET`, serta akun Admin dan Tim.
3. Jalankan `npm ci`, `npm run db:validate`, `npm run db:setup`, lalu `npm run dev`; buka `http://localhost:5173`.
4. Atur integrasi Google OAuth, Midtrans Sandbox, dan Fonnte hanya jika fitur tersebut akan digunakan.
5. Untuk deploy, siapkan VPS Ubuntu, PostgreSQL lokal, Node.js, PM2, domain, dan Nginx; isi `.env` production, jalankan generate/schema/seed/build, lalu aktifkan PM2 dan HTTPS.
6. Untuk update, tinjau `git status` dan branch terlebih dahulu, gunakan `git pull --ff-only`, install dari lockfile dengan `npm ci`, build, lalu restart aplikasi. Backup dan tinjau skema sebelum menjalankan `db:deploy`.
