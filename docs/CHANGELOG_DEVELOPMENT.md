# Changelog Pengembangan

Catatan ini mencatat perubahan RekapBarisWeb yang dibuat selama pekerjaan revisi.

## 2026-10-22 — Penyelesaian alur transaksi QRIS

### Perubahan

- Event yang dibuka dari tab E-Voting langsung menampilkan daftar peserta dan aksi vote; tab tiket tetap membuka pilihan tanggal dan pembelian tiket.
- Checkout Midtrans mengarahkan kembali ke transaksi milik pengguna. Aplikasi memeriksa status notifikasi dan menampilkan hasil tertunda/berhasil/gagal.
- Hasil pembayaran menampilkan jumlah vote, tiket beserta kode terbit, atau nomor kontak admin untuk konfirmasi pengiriman merchandise yang lunas.
- Tombol checkout tiket mengarahkan pengguna yang belum masuk ke autentikasi; pilihan ukuran merchandise awal memakai varian yang masih memiliki stok.
- Verifikasi signature dan pemetaan status notifikasi Midtrans dipisahkan ke helper yang memiliki tes unit.

### Status verifikasi

- `npm run build`: berhasil.
- `npm run test:auth`: berhasil, termasuk tes signature dan pemetaan status webhook.
- `npm run check`: berhasil.
- Pembayaran sandbox/live dan notifikasi gateway nyata belum dijalankan; konfigurasi credentials serta URL notifikasi Midtrans tetap diperlukan.

## 2026-10-22 — Dashboard rekap penilaian

### Perubahan

- Dashboard Admin/Tim menempatkan pembuatan event dan database peserta di tab Event, serta katalog dan kontrol stok di tab Merchandise.
- Rekap penilaian dipisah menjadi tab **Konfigurasi Format Nilai** dan **Rekap Penilaian**; konfigurasi menyediakan pilihan kriteria bawaan, kriteria kustom, pengelolaan/penugasan juri, dan penerapan format ke event.
- Tab rekap menampilkan event dan peserta sebagai baris yang dapat dipilih, menyediakan input nilai per kriteria untuk juri yang ditugaskan, serta ranking sementara.
- Admin/Tim dapat mencatat nilai dengan memilih juri aktif yang memang ditugaskan; skor tetap tercatat atas nama juri agar perhitungan ranking konsisten dengan input juri.
- Error pemuatan database peserta kini ditampilkan di tab Event, bukan menghasilkan error referensi state yang tidak tersedia.

### Status verifikasi

- Build produksi, pemeriksaan sintaks server, validasi Prisma, seluruh tes Node, dan pemeriksaan whitespace dijalankan setelah perubahan.
- Pencatatan skor dan pembayaran tetap memerlukan verifikasi fungsional pada akun/event yang sudah memiliki data.

## 2026-10-22 — Beranda event dan pendaftaran peserta

### Perubahan

- Beranda menempatkan direktori event terverifikasi sebagai konten utama dan menampilkan seluruh event yang tersedia beserta poster atau placeholder saat poster belum diunggah.
- Pendaftaran dari detail event menyimpan event yang dipilih selama proses autentikasi. Pendaftaran peserta baru otomatis membuat akun aktif dan masuk; akun penyelenggara tetap menunggu persetujuan.
- Akun peserta baru dari Google juga aktif, sehingga pendaftaran event yang tertunda dapat dilanjutkan setelah OAuth kembali ke aplikasi.
- Dashboard peserta memiliki menu `List Event` dengan poster, jadwal, satuan, dan status pendaftaran; pendaftaran beberapa event tetap memakai relasi akun-event yang sudah tersedia.

### Status verifikasi

- `npm run build`: berhasil.
- `npm run test:auth`: berhasil.
- `npm run check`: berhasil.

## 2026-10-22 — Audit awal dan daftar event beranda

### Audit

- Frontend: React 18 dan Vite 5; backend: Express 4; basis data PostgreSQL melalui Prisma 6.
- Autentikasi menggunakan cookie dan JWT; role meliputi Admin, Tim, penyelenggara, juri, dan peserta.
- Event publik berasal dari `GET /api/events`, yang hanya mengembalikan event `APPROVED`. Poster tersimpan lewat upload ke `/uploads/` dan `posterUrl` lama tetap tersedia.
- Midtrans Snap QRIS telah digunakan. Pembuatan transaksi, pemeriksaan tanda tangan notifikasi, dan transisi idempoten dari `PENDING` sudah tersedia. Nama variabel provider ada di `.env`, tetapi nilainya tidak dibaca dan pembayaran/webhook nyata belum diverifikasi pada audit ini.
- Penilaian, kriteria, penugasan juri, dan ranking sementara sudah memiliki model serta endpoint per event.
- Proxy frontend mengarah ke `http://localhost:3000`; probe `GET /api/health` tidak memperoleh respons pada saat audit. Karena itu, penyebab langsung `Failed to fetch` saat pemeriksaan adalah API lokal tidak merespons; penyebab proses backend tidak aktif/gagal start masih perlu ditelusuri ketika log/runtime tersedia.
- Relasi peserta-event saat ini nullable pada akun dan memiliki unique constraint `(eventId, participantName)`, sehingga belum menjamin satu pendaftaran per akun pada setiap event.
- Tiket belum menyimpan ID jadwal pelaksanaan, dan merchandise memakai stok produk tunggal (belum ada varian ukuran).

### Perubahan

- Beranda kini menampilkan hingga tiga event yang benar-benar dipublikasikan dari API, dengan poster, placeholder yang konsisten, ringkasan, dan tautan ke detail event.
- Form pengajuan, pembuatan, dan edit event memakai upload poster tanpa meminta URL poster mentah. Poster lama di editor ditampilkan sebagai gambar; data dan endpoint URL lama tidak dihapus.
- Tidak ada perubahan skema atau migrasi database.

### Status verifikasi

- `npm run build`: berhasil, termasuk setelah penyesuaian semua formulir poster.
- `npm run test:auth`: 11 lulus, 0 gagal.
- `npm run check`: berhasil.
- `git diff --check`: berhasil; Git hanya melaporkan konversi akhir baris LF/CRLF.

## 2026-10-22 — Keunikan pendaftaran per akun dan event

### Perubahan

- Menambahkan unique constraint Prisma pada `(eventId, userId)`. Pendaftaran lama tanpa akun tetap diizinkan karena `userId` nullable; pendaftaran satu akun ke event lain tetap diizinkan.
- Endpoint pendaftaran memeriksa pendaftaran yang sudah ada dan mengembalikan HTTP 409. Constraint database juga menangani dua request bersamaan.
- Tidak mengubah atau menghapus baris pendaftaran yang sudah ada.

### Database

- Target diverifikasi tanpa mencetak kredensial: `rekapbaris.public` di PostgreSQL lokal.
- Sebelum perubahan, tidak ditemukan pasangan akun-event ganda.
- `npm run db:deploy` pertama dihentikan oleh peringatan Prisma tentang kemungkinan duplikasi. Setelah verifikasi data, `npm run db:deploy -- --accept-data-loss` berhasil dan hanya menambahkan index `EventRegistration_eventId_userId_key`.
- Pemeriksaan setelah sinkronisasi memastikan index ada dan jumlah pasangan duplikat tetap nol.
- Tidak ada berkas migrasi SQL di repo ini; workflow skema yang tersedia adalah `prisma db push`.

### Status verifikasi

- `npm run db:validate`: berhasil dan Prisma Client tergenerate.
- Pemeriksaan database sesudah sinkronisasi berhasil.
- `npm run build`: berhasil.
- `npm run test:auth`: 11 lulus, 0 gagal.
- `npm run check`: berhasil.
- `git diff --check`: berhasil.
- Runtime API tidak merespons saat audit; koneksi database berhasil dikonfirmasi pada pemeriksaan lanjutan di bawah. Tidak ada transaksi pembayaran nyata yang diuji.

## 2026-10-22 — Tiket per tanggal dan voting melalui checkout

### Perubahan kode

- Pendaftaran akun peserta sekarang dapat dilanjutkan ke event yang sedang dibuka setelah registrasi akun/login; event yang dipilih dipertahankan di `sessionStorage` sampai relasi pendaftaran berhasil disimpan.
- Event detail memerlukan pemilihan ID jadwal untuk membeli tiket, mengumpulkan nama dan nomor HP pembeli, dan menampilkan tiket yang diterbitkan setelah pembayaran di dashboard peserta.
- Backend menyimpan jadwal dan snapshot nama/harga pembelian dalam transaksi. Notifikasi Midtrans diverifikasi dan transisi dari status `PENDING` dilakukan secara kondisional; penerbitan tiket hanya terjadi pada notifikasi pembayaran terverifikasi yang pertama.
- Checkout vote sekarang meminta jumlah vote dan mengirim jumlah tersebut ke endpoint backend. Total pada UI hanya estimasi; server tetap menentukan jumlah/harga transaksi. Modal checkout mengarahkan ke Midtrans, dan vote tetap dicatat melalui notifikasi terverifikasi.
- Respons daftar dan detail event publik hanya berasal dari event yang disetujui. Poster menggunakan gambar atau placeholder; form event tidak meminta URL poster mentah.

### Database

- `PaymentStatus` kini meliputi `EXPIRED` dan `CANCELLED`; ditambahkan model `Ticket` dengan kode unik dan relasi ke pembayaran, event, serta jadwal.
- `Payment` menyimpan jadwal dan snapshot data pembeli/item untuk transaksi tiket.
- Skema disinkronkan ke PostgreSQL lokal melalui `prisma db push` setelah Prisma Client berhasil dibuat. Perubahan bersifat aditif; tidak ada tabel/transaksi lama yang dihapus.
- Unik `(eventId,userId)` pada pendaftaran akun-event telah ditambahkan pada sinkronisasi sebelumnya; sebelum itu tidak ditemukan duplikasi.

### Batasan yang masih terbuka

- Pembayaran live dan notifikasi dari akun Midtrans nyata belum diverifikasi; kelengkapan credentials/webhook di deployment tetap perlu pemeriksaan operasional.
- Database peserta kini tersedia di tab Event dashboard Admin/Tim. Produk kini mendukung pilihan ukuran, stok per varian, modal quantity, foto unggahan, dan kontak admin dari konfigurasi ADMIN_PHONE/TEAM_PHONE setelah pembayaran terverifikasi.
- Format penilaian dapat disimpan dari konfigurasi event dan disalin ke event lain. Salinan kriteria menjadi konfigurasi event tersendiri; penerapan ditolak jika nilai event sudah tersimpan.
- Penyebab `Failed to fetch` yang teramati adalah API lokal tidak berjalan saat probe pertama. Endpoint health kemudian merespons setelah server dijalankan; belum ada perubahan autentikasi/CORS dan server perlu tetap aktif agar proxy lokal bekerja.

### Status verifikasi

- `npm run db:validate`: berhasil.
- `npm run check`: berhasil.
- `npm run test:auth`: 11 lulus, 0 gagal (termasuk ranking dan aturan nilai yang sudah ada).
- `npm run build`: berhasil setelah perubahan checkout vote.
- `npm run db:deploy`: database lokal melaporkan sudah sinkron dengan schema Prisma; Prisma Client berhasil dibuat.
- `git diff --check`: berhasil; hanya ada peringatan normal konversi akhir baris LF/CRLF.
- Tidak menjalankan pembayaran nyata atau webhook gateway eksternal.

## 2026-10-22 — Penyelesaian lanjutan dashboard, merchandise, dan format penilaian

### Perubahan kode

- Dashboard Admin/Tim menampilkan database peserta event dalam tab Event, dengan nama, regu, status, tanggal pendaftaran, dan nomor urut. Endpoint tetap membatasi akses ke staf.
- Katalog merchandise menyediakan modal checkout, pilihan jumlah, foto unggahan (JPEG/PNG/WebP, maksimal 5 MB), dan pilihan ukuran jika produk memiliki varian.
- Staf dapat membuat varian dalam format S:10, M:8 dan mengubah stok tiap ukuran. Pembelian memeriksa stok ukuran serta stok agregat secara transaksional; pembayaran gagal/kedaluwarsa mengembalikan reservasi melalui transisi idempoten.
- Kontak ADMIN_PHONE atau TEAM_PHONE hanya ditambahkan ke dashboard pemilik pesanan merchandise setelah pembayaran berstatus SETTLED.
- Kriteria dan daftar juri event dapat disimpan sebagai format dan disalin ke event pilihan. Perubahan format utama tidak mengubah salinan event; backend menolak penerapan jika nilai sudah tersimpan.
- Kegagalan koneksi API menampilkan pesan yang mengarahkan pemeriksaan server lokal dan proxy.

### Database dan verifikasi

- Schema menambah ProductVariant, Payment.variantId, ScoringFormat, ScoringFormatCriterion, ScoringFormatJudge, serta relasi format dan waktu penerapan pada event.
- `npm run db:deploy` berhasil; PostgreSQL lokal sinkron dengan schema dan Prisma Client tergenerate. Tidak ada data produk, event, atau nilai lama yang dihapus.
- `npm run db:validate`, `npm run check`, `npm run build`, dan `npm run test:auth` berhasil (11 tes lulus).
- Smoke check lokal: `/api/health` merespons sehat; `/api/events` dan `/api/merch` merespons tanpa error dan masing-masing saat ini berisi 0 event serta 0 produk. UI memakai keadaan kosong, tanpa membuat data contoh.
- Vite merespons HTTP 200 di `http://localhost:5173/`.
- Pembayaran Midtrans live dan webhook nyata belum diuji; verifikasi gateway masih memerlukan kredensial dan notifikasi dari environment Midtrans.

## 2026-10-22 — Deploy VPS manual saja

### Perubahan

- Menghapus `.github/workflows/deploy.yml`, satu-satunya workflow yang menjalankan deploy VPS otomatis pada push ke `main` atau melalui GitHub Actions manual.
- README tidak lagi menginstruksikan setup workflow atau secrets deploy GitHub Actions. Instruksi deployment SSH/PM2 manual dan `start.sh` tetap ada.
- Tidak ada perubahan aplikasi, skema database, data, atau alur build/test lokal.

### Status

- `git diff --check`: berhasil.
- Penghapusan workflow berlaku di GitHub setelah perubahan repo ini dikirim ke branch utama. Tidak ada deployment VPS yang dijalankan dari workspace ini.
