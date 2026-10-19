# Rekap Baris

Platform web untuk pengelolaan event, pendaftaran peserta, e-voting, e-ticketing, dan merchandise. Aplikasi berada langsung di root repositori (folder `RekapBarisWeb`), dengan satu server Node.js yang menyajikan API Express sekaligus hasil build React.

## Fitur yang tersedia

- Halaman publik responsif, navigasi mobile yang sticky, transisi antartab, tema gelap/terang, pencarian serta filter event.
- Pendaftaran peran Peserta, Penyelenggara, dan Juri. Login menggunakan OTP WhatsApp; pendaftaran menunggu verifikasi staf.
- Penyelenggara dapat mengajukan event; event hanya muncul setelah disetujui Admin/Tim Rekap.
- Pendaftaran peserta event, persetujuan peserta, e-voting, tiket, dan merchandise.
- Checkout QRIS Midtrans dengan webhook bertanda tangan; stok merchandise dikurangi saat pesanan dibuat dan dikembalikan jika pembayaran gagal.
- Dashboard staf untuk ringkasan, verifikasi akun, moderasi event, peserta, transaksi, dan penambahan merchandise.
- Reset kata sandi melalui email SMTP dan perubahan kata sandi setelah login.
- Logo lokal di `public/logo.svg`; ganti file tersebut dengan logo milik Anda menggunakan nama yang sama.

> **Status integrasi eksternal:** Fonnte, Midtrans, SMTP, dan PostgreSQL memerlukan akun/kredensial milik pemilik aplikasi. Nilai contoh di `.env.example` bukan kredensial aktif. Jangan menaruh token atau kunci privat di source code, percakapan, Git, atau frontend.

## Teknologi

- Node.js `18.18` sampai `24.x`, Express 4, React 18 + Vite.
- PostgreSQL dan Prisma ORM (`prisma db push` menyelaraskan skema database).
- OTP WhatsApp melalui Fonnte; QRIS melalui Midtrans Snap.
- bcryptjs untuk hashing kata sandi, JWT dalam cookie HttpOnly, Zod untuk validasi, Helmet dan rate limit.
- Lucide React untuk ikon; CSS responsif tanpa framework CSS tambahan.

## Struktur folder

```text
RekapBarisWeb/
├── .env.example
├── .gitignore
├── index.html
├── package.json
├── README.md
├── server.js                  # Express API, autentikasi, event, pembayaran dan dashboard
├── setup.bat                  # Setup lokal Windows
├── start.sh                   # Setup/build/start untuk shell Linux
├── vite.config.js
├── prisma/
│   ├── schema.prisma
│   └── seed.js                # Membuat akun Admin dan Tim Rekap dari environment
├── public/
│   └── logo.svg
└── src/
    ├── App.jsx
    ├── main.jsx
    └── styles.css
```

## Persiapan kredensial yang aman

Token Fonnte pernah ditempelkan ke percakapan. Perlakukan token itu sebagai **sudah terpapar**: cabut/rotasi dari dashboard Fonnte sebelum mengaktifkan aplikasi. Jangan menyalin token lama tersebut ke `.env`.

### 1. Persyaratan layanan

Siapkan:

1. Node.js 18.18–24.x dan npm.
2. PostgreSQL yang bisa diakses oleh aplikasi (database dan user khusus aplikasi).
3. Token Fonnte baru dengan perangkat WhatsApp yang tersambung.
4. Midtrans Server Key dan Client Key. Mulai dari Sandbox.
5. (Opsional) Akun Resend, API key, dan domain pengirim terverifikasi untuk reset kata sandi.

Buat kredensial admin dan tim yang unik, gunakan kata sandi minimal 12 karakter, dan simpan di password manager. Akun tersebut dibuat oleh seed database dari nilai `ADMIN_*` dan `TEAM_*` di `.env`.

### 2. Konfigurasi lokal

Salin `.env.example` sebagai `.env`, lalu isi nilainya. **Jangan** commit `.env`.

PowerShell:

```powershell
Copy-Item .env.example .env
```

Linux/macOS:

```sh
cp .env.example .env
```

Contoh format `DATABASE_URL`:

```text
postgresql://nama_user:kata_sandi@127.0.0.1:5432/rekapbaris?schema=public
```

Karakter khusus pada kata sandi database harus di-URL-encode. Gunakan `COOKIE_SECURE=false` hanya saat pengembangan lokal HTTP. Buat `JWT_SECRET` acak minimal 32 karakter, misalnya:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Set `FONNTE_TOKEN`, `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, `MIDTRANS_IS_PRODUCTION=false`, `ADMIN_*`, dan `TEAM_*`. Untuk email reset, verifikasi domain pengirim pada Resend lalu isi `RESEND_API_KEY`, `EMAIL_FROM`, serta `APP_URL`. Jika layanan email belum dikonfigurasi, endpoint reset mengembalikan error konfigurasi secara eksplisit; email tidak akan berpura-pura terkirim.

### 3. Instalasi dan jalankan

Windows:

```powershell
.\setup.bat
npm start
```

Linux:

```sh
chmod +x start.sh
./start.sh
```

Script `start.sh` memasang dependency, membuat Prisma Client, menyelaraskan tabel PostgreSQL, membuat akun seed, membangun frontend, lalu memangkas dependency yang tidak diperlukan runtime. `setup.bat` melakukan instalasi dan build tanpa prune agar dependency development tetap tersedia untuk coding lokal. Setelah setup, `npm start` menjalankan server pada port `3000` (atau nilai `PORT`). Buka `http://localhost:3000`.

Perintah manual yang setara:

```sh
npm install
npm run db:setup
npm run build
npm start
```

`npm run dev` menjalankan Vite pada port 5173 dan API pada port 3000; Vite meneruskan `/api` ke Express. Database dan `.env` harus siap lebih dahulu.

### 4. Akun staf awal

Seed membuat satu `ADMIN` dan satu `TEAM` dari environment. Isikan email, nomor WhatsApp, nama, serta kata sandi minimal 12 karakter pada `ADMIN_*` dan `TEAM_*` sebelum `npm run db:seed`.

- Akun staf aktif dan dianggap sudah verifikasi WhatsApp agar dashboard dapat digunakan saat instalasi.
- Akun pengguna publik tetap `PENDING` sampai OTP terverifikasi dan staf menyetujui akun.
- Seed berikutnya tidak mengganti kata sandi staf yang telah diubah.
- Endpoint `POST /api/auth/password` menerima kata sandi saat ini dan yang baru untuk penggantian. Login web tetap memakai OTP WhatsApp.

## Deploy ke Hostinger

Nama menu dapat berbeda mengikuti paket/versi panel Hostinger. Gunakan Node.js App/Setup Node.js App jika tersedia, atau VPS dengan process manager dan reverse proxy.

### Opsi A — Hostinger Node.js App

1. Pastikan domain telah diarahkan ke hosting dan PostgreSQL tersedia serta dapat diakses oleh aplikasi.
2. Upload isi repositori ke **document/application root** `RekapBarisWeb` (bukan membuat `RekapBarisWeb/RekapBarisWeb`). Jangan upload `node_modules`, `.env` development, atau kunci Midtrans/Fonnte ke Git.
3. Pilih Node.js versi 20 atau 22 (versi lain yang didukung: 18.18–24.x) dan mode production.
4. Atur environment variables di panel. Masukkan semua nilai pada `.env.example` yang relevan, tetapi gunakan:
   - `NODE_ENV=production`
   - `APP_URL=https://domain-anda`
   - `COOKIE_SECURE=true`
   - `DATABASE_URL` PostgreSQL produksi
   - `JWT_SECRET` baru yang kuat
   - token Fonnte yang baru dirotasi
   - kredensial Midtrans **production** hanya setelah uji sandbox tuntas.
5. Atur install command `npm install`, build command `npm run db:setup && npm run build && npm prune --omit=dev` pada pemasangan awal, dan start command `npm start`. Pastikan `PORT` yang diberikan panel diteruskan ke Node.js (aplikasi sudah membacanya).
6. Jika panel tidak menyediakan terminal saat deployment, siapkan database serta environment variables lebih dahulu dan gunakan build/deploy hook panel. Jangan menjalankan seed dengan nilai contoh.
7. Setelah deployment, buka `https://domain-anda/api/health`. Respons `{ "ok": true, ... }` menandakan server serta koneksi database berhasil.

Untuk deployment berikutnya, umumnya gunakan build `npm run db:generate && npm run build`; jalankan sinkronisasi database dan seed secara terkontrol ketika skema berubah. `prisma db push` menyelaraskan skema saat ini tanpa berkas migration dan bukan pengganti workflow migration terencana untuk tim/produksi berskala besar.

### Opsi B — VPS Hostinger dengan systemd

Pasang Node.js LTS (18.18 atau lebih baru hingga 24.x), PostgreSQL, dan Nginx. Upload aplikasi ke `/var/www/RekapBarisWeb` dan atur pemilik file untuk user service.

```sh
cd /var/www/RekapBarisWeb
cp .env.example .env
nano .env
npm install
npm run db:setup
npm run build
npm prune --omit=dev
```

Atur `.env` agar `PORT=3000`, `NODE_ENV=production`, `APP_URL=https://domain-anda`, `COOKIE_SECURE=true`, serta gunakan secret produksi. Jalankan pembuatan Prisma Client dan build sebelum `npm prune --omit=dev`; instal ulang dependency lengkap sementara untuk build/skema berikutnya. Lindungi file `.env` tersebut:

```sh
chmod 600 .env
```

Buat service systemd `/etc/systemd/system/rekapbaris.service` (ubah `User` dan `WorkingDirectory` sesuai server):

```ini
[Unit]
Description=Rekap Baris Web
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/RekapBarisWeb
EnvironmentFile=/var/www/RekapBarisWeb/.env
ExecStart=/usr/bin/node /var/www/RekapBarisWeb/server.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Aktifkan service:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now rekapbaris
sudo systemctl status rekapbaris
```

Konfigurasikan Nginx sebagai reverse proxy HTTPS ke `http://127.0.0.1:3000`, aktifkan sertifikat TLS, lalu reload Nginx. Jangan membuka port database ke publik. Gunakan firewall untuk hanya membuka SSH, HTTP, dan HTTPS.

## Integrasi Fonnte OTP

- API pengiriman: `POST https://api.fonnte.com/send`, token dibaca hanya dari `FONNTE_TOKEN`.
- Format nomor internasional tanpa tanda `+` (contoh format: `62812...`).
- Kode OTP 6 digit disimpan sebagai HMAC, kedaluwarsa 5 menit, maksimal 5 percobaan verifikasi; endpoint autentikasi diberi rate limit.
- Alur daftar: akun dibuat berstatus `PENDING`, OTP memverifikasi nomor, lalu Admin/Tim Rekap menyetujui akun.
- Alur masuk: `POST /api/auth/otp/request` lalu `POST /api/auth/otp/verify`.
- Jika Fonnte gagal, API mengembalikan error dan tidak membuat sesi login.

## Integrasi Midtrans QRIS

1. Mulai dengan kredensial Sandbox pada `.env`; jangan menggunakan Server Key di browser.
2. Endpoint pembayaran membatasi metode Snap ke QRIS. API mengirim token checkout ke Midtrans dan pengguna diarahkan ke halaman pembayaran Midtrans.
3. Atur Payment Notification URL pada dashboard Midtrans menjadi:

   ```text
   https://domain-anda/api/payments/midtrans/notification
   ```

4. Pastikan endpoint dapat dijangkau publik melalui HTTPS. Status pembayaran hanya berubah ketika webhook dengan signature SHA-512 yang valid diterima.
5. Uji pembayaran pending, sukses, gagal, duplikasi webhook, serta stok merchandise. Setelah Sandbox diverifikasi, isi key produksi dan set `MIDTRANS_IS_PRODUCTION=true`.

Nilai harga vote dan harga tiket awal ditentukan oleh event; harga vote default Rp1.000. Edit konfigurasi event pada database/layanan admin sebelum penjualan jika butuh harga berbeda. Harga `0` tidak dapat dipakai untuk checkout berbayar.

## API utama

| Method | Path | Keterangan |
|---|---|---|
| `GET` | `/api/health` | Cek aplikasi dan koneksi database |
| `POST` | `/api/auth/register` | Membuat akun publik dan mengirim OTP |
| `POST` | `/api/auth/otp/request` | Meminta OTP login WhatsApp |
| `POST` | `/api/auth/otp/verify` | Verifikasi OTP dan membuat cookie sesi |
| `POST` | `/api/auth/forgot-password` | Mengirim tautan reset melalui SMTP |
| `GET` | `/api/events` | Event yang disetujui |
| `POST` | `/api/events/:id/register` | Mendaftar sebagai peserta |
| `POST` | `/api/payments/vote` | Membuat checkout vote |
| `POST` | `/api/payments/ticket` | Membuat checkout tiket |
| `POST` | `/api/payments/merch` | Membuat checkout merchandise |
| `POST` | `/api/payments/midtrans/notification` | Webhook status Midtrans |
| `GET/PATCH` | `/api/admin/*` | Dashboard dan moderasi khusus staf aktif |

Semua API menerima JSON. Cookie sesi HttpOnly, SameSite Lax, dan Secure saat production digunakan untuk rute terautentikasi. Endpoint admin melakukan pemeriksaan role di server, bukan hanya menyembunyikan menu frontend.

## Menyesuaikan tampilan dan aset

- Ganti `public/logo.svg` dengan logo SVG milik Anda dan pertahankan nama file.
- Poster event dan gambar produk memakai URL HTTPS yang diisi pada data produk/event. Gunakan sumber gambar yang berhak Anda gunakan dan optimalkan ukuran gambar sebelum upload.
- Warna, responsivitas, loading state, dan transisi ada di `src/styles.css`; komponen halaman ada di `src/App.jsx`.
- Jangan memasukkan secret API, password, atau token pembayaran ke frontend.

## Pemeriksaan lokal

```sh
npm run check
npm run build
npm start
```

Untuk cek layanan setelah berjalan: `GET http://localhost:3000/api/health`. Pastikan PostgreSQL aktif dan `.env` valid sebelum menjalankan seed atau server.

## Rekomendasi ekstensi/library

**VS Code:** ESLint, Prettier, Prisma, DotENV, Error Lens, EditorConfig, REST Client, dan GitLens. Gunakan hanya ekstensi yang dipercaya dan hindari memasukkan nilai `.env` ke file request yang masuk Git.

**Library saat ini:** React, Vite, Express, Prisma, PostgreSQL, Lucide React, Zod, bcryptjs, Helmet, express-rate-limit, dan Midtrans Client. Email reset memakai Fetch bawaan Node ke Resend sehingga tidak menambah dependency SMTP. Tambahkan Socket.IO hanya bila pembaruan voting/dashboard real-time benar-benar dibutuhkan; polling ringan atau refresh manual lebih sederhana sebagai tahap awal. Tailwind CSS/Framer Motion juga opsional—UI ini memakai CSS responsif dan animasi CSS agar dependency tetap ringkas.

## Catatan produksi

- Sediakan backup PostgreSQL terenkripsi dan uji pemulihan sebelum penggunaan publik.
- Gunakan secret unik per environment, rotasi token yang pernah terekspos, batasi akses ke panel, dan audit transaksi.
- Audit dependency setelah upgrade Express/Midtrans dan penggunaan Fetch untuk email masih melaporkan empat advisori tinggi pada dependency transitif CLI Prisma 6 (`deepmerge-ts` dan `effect`). Prisma CLI hanya dibutuhkan pada tahap build/sinkronisasi skema; tidak tercantum dalam `npm ls --omit=dev --depth=0`. Prisma 7 tidak dipakai karena akan mengorbankan dukungan Node 18 yang diminta. Pantau rilis Prisma 6 yang memperbaiki dependency tersebut dan evaluasi ulang audit saat upgrade.
- Pastikan kebijakan privasi, syarat penggunaan, pajak/izin, refund, dan ketentuan voting/ticketing sesuai operasional Anda.
- Skema saat ini adalah fondasi aplikasi awal. Pengelolaan peserta juri yang kompleks, check-in QR tiket, dispute/refund, laporan akuntansi, dan alur penetapan harga event tingkat lanjut perlu dirancang sesuai proses bisnis sebelum dipakai untuk event komersial besar.
