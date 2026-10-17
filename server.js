require("dotenv").config();

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const Database = require("better-sqlite3");
const nodemailer = require("nodemailer");
const { OAuth2Client } = require("google-auth-library");

const app = express();
const port = Number(process.env.PORT || 3000);
const appUrl = (process.env.APP_URL || `http://localhost:${port}`).replace(/\/$/, "");
const sessionSecret = process.env.SESSION_SECRET || "development-only-change-this-session-secret";
if (process.env.NODE_ENV === "production" && sessionSecret.length < 32) {
  throw new Error("SESSION_SECRET harus diisi dengan minimal 32 karakter saat NODE_ENV=production.");
}
const dbPath = path.resolve(process.env.DATABASE_PATH || "./data/rekapbaris.sqlite");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
    password_hash TEXT, role TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '',
    institution TEXT NOT NULL DEFAULT '', event_name TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending', google_sub TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS password_resets (
    token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, category TEXT NOT NULL,
    description TEXT NOT NULL, venue TEXT NOT NULL, starts_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'available', poster TEXT NOT NULL DEFAULT '',
    ticket_price INTEGER NOT NULL DEFAULT 0, popularity INTEGER NOT NULL DEFAULT 0,
    owner_id INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name TEXT NOT NULL, institution TEXT NOT NULL DEFAULT '', votes INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS merchandise (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT NOT NULL,
    price INTEGER NOT NULL, image TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1,
    purchased INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    judge_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 100), notes TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(candidate_id, judge_id)
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id), event_id INTEGER REFERENCES events(id),
    merch_id INTEGER REFERENCES merchandise(id), kind TEXT NOT NULL, candidate_id INTEGER REFERENCES candidates(id),
    quantity INTEGER NOT NULL DEFAULT 1, amount INTEGER NOT NULL,
    shipping_address TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending',
    snap_token TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);
if (!db.prepare("PRAGMA table_info(events)").all().some((column) => column.name === "owner_id")) {
  db.exec("ALTER TABLE events ADD COLUMN owner_id INTEGER REFERENCES users(id)");
}

const seedEvents = [
  ["Festival Baris Nusantara 2026", "Festival", "Panggung kolaborasi pasukan baris-berbaris dari berbagai daerah. Saksikan penampilan terbaik dan dukung pasukan favoritmu.", "GOR Amongrogo, Yogyakarta", "2026-11-21T08:00:00+07:00", "available", "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1000&q=85", 35000, 248],
  ["Lomba Ketangkasan Baris-Berbaris", "Kompetisi", "Ajang ketangkasan, disiplin, dan kekompakan pelajar tingkat nasional.", "Stadion Pakansari, Bogor", "2026-12-06T07:30:00+07:00", "available", "https://images.unsplash.com/photo-1523580494863-6f3031224c94?auto=format&fit=crop&w=1000&q=85", 25000, 187],
  ["Parade Kreasi Pelajar", "Parade", "Parade kreasi penuh semangat dari sekolah dan komunitas pilihan.", "Lapangan Gasibu, Bandung", "2026-09-20T09:00:00+07:00", "completed", "https://images.unsplash.com/photo-1504609813442-a8924e83f76e?auto=format&fit=crop&w=1000&q=85", 20000, 402]
];
if (db.prepare("SELECT COUNT(*) AS total FROM events").get().total === 0) {
  const addEvent = db.prepare("INSERT INTO events (title,category,description,venue,starts_at,status,poster,ticket_price,popularity) VALUES (?,?,?,?,?,?,?,?,?)");
  for (const event of seedEvents) addEvent.run(...event);
  const addCandidate = db.prepare("INSERT INTO candidates (event_id,name,institution) VALUES (?,?,?)");
  for (const eventId of [1, 2]) {
    addCandidate.run(eventId, "Garuda Muda", "SMA Negeri 1 Yogyakarta");
    addCandidate.run(eventId, "Cakra Nusantara", "SMK Negeri 2 Bogor");
    addCandidate.run(eventId, "Elang Perkasa", "SMA Negeri 5 Bandung");
  }
}
if (db.prepare("SELECT COUNT(*) AS total FROM merchandise").get().total === 0) {
  const addMerch = db.prepare("INSERT INTO merchandise (name,description,price,image) VALUES (?,?,?,?)");
  addMerch.run("Kaos RekapBaris", "Kaos harian dengan semangat baris-berbaris.", 125000, "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=1000&q=85");
  addMerch.run("Tote Bag Disiplin", "Tas serbaguna untuk membawa perlengkapan event.", 65000, "https://images.unsplash.com/photo-1597481499750-3e6b22637e12?auto=format&fit=crop&w=1000&q=85");
  addMerch.run("Topi RekapBaris", "Topi edisi RekapBaris untuk dukungan di setiap barisan.", 85000, "https://images.unsplash.com/photo-1588850561407-ed78c282e89b?auto=format&fit=crop&w=1000&q=85");
}

const hash = (value) => crypto.createHmac("sha256", sessionSecret).update(value).digest("hex");
const makePassword = (password) => {
  const salt = crypto.randomBytes(16);
  return `${salt.toString("hex")}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
};
const checkPassword = (password, encoded) => {
  if (!encoded) return false;
  const [saltHex, hashHex] = encoded.split(":");
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), 64);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
};
const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

function seedStaff(emailKey, passwordKey, role, nameKey, fallbackName) {
  const email = (process.env[emailKey] || "").trim().toLowerCase();
  const password = process.env[passwordKey] || "";
  if (!email && !password) return;
  if (!validEmail(email) || password.length < 12) {
    console.error(`${emailKey}/${passwordKey}: gunakan email valid dan password minimal 12 karakter.`);
    return;
  }
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (!existing) {
    db.prepare("INSERT INTO users (name,email,password_hash,role,status) VALUES (?,?,?,?, 'verified')")
      .run(process.env[nameKey] || fallbackName, email, makePassword(password), role);
  }
}
seedStaff("ADMIN_EMAIL", "ADMIN_PASSWORD", "admin", "ADMIN_NAME", "Administrator RekapBaris");
seedStaff("TEAM_EMAIL", "TEAM_PASSWORD", "team", "TEAM_NAME", "Tim Rekap");

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || undefined);
app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

function createSession(userId, res) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = Date.now() + 7 * 24 * 60 * 60 * 1000;
  db.prepare("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)").run(hash(token), userId, expires);
  res.cookie("rb_session", token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    maxAge: expires - Date.now(), path: "/"
  });
}
function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status };
}
function requireAuth(req, res, next) {
  const token = req.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith("rb_session="))?.slice("rb_session=".length);
  if (!token) return res.status(401).json({ error: "Silakan masuk terlebih dahulu." });
  const session = db.prepare("SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?").get(hash(decodeURIComponent(token)), Date.now());
  if (!session) return res.status(401).json({ error: "Sesi telah berakhir. Silakan masuk kembali." });
  req.user = db.prepare("SELECT id,name,email,role,status FROM users WHERE id = ?").get(session.user_id);
  if (!req.user) return res.status(401).json({ error: "Akun tidak ditemukan." });
  next();
}
function requireVerified(req, res, next) {
  if (req.user.status !== "verified") return res.status(403).json({ error: "Akun Anda menunggu verifikasi Tim Rekap." });
  next();
}
function requireStaff(req, res, next) {
  if (!["admin", "team"].includes(req.user.role)) return res.status(403).json({ error: "Akses khusus Tim Rekap dan Admin." });
  next();
}
function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Akses khusus Admin." });
  next();
}
const accountView = (row) => ({
  id: row.id, name: row.name, email: row.email, role: row.role, phone: row.phone,
  institution: row.institution, event_name: row.event_name, status: row.status, created_at: row.created_at
});
function currentEventStatus(event) {
  if (event.status === "completed") return "completed";
  if (event.status === "pending") return "pending";
  const startsAt = Date.parse(event.starts_at);
  if (!Number.isFinite(startsAt) || startsAt > Date.now()) return event.status === "ongoing" ? "ongoing" : "available";
  return Date.now() < startsAt + 12 * 60 * 60 * 1000 ? "ongoing" : "completed";
}

app.get("/api/config", (req, res) => res.json({
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  votePrice: Number(process.env.VOTE_PRICE || 5000),
  midtransProduction: String(process.env.MIDTRANS_IS_PRODUCTION).toLowerCase() === "true"
}));
app.get("/api/me", requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));
app.post("/api/register", (req, res) => {
  const { name, email, password, phone, role, institution = "", eventName = "" } = req.body || {};
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!name?.trim() || !validEmail(normalizedEmail) || !/^(participant|organizer|judge)$/.test(role || "") || !/^\+?[0-9\s().-]{8,20}$/.test(phone || "") || String(password || "").length < 10) {
    return res.status(400).json({ error: "Periksa kembali nama, email, nomor telepon, jenis akun, dan password (minimal 10 karakter)." });
  }
  if (role === "organizer" && (!institution.trim() || !eventName.trim())) return res.status(400).json({ error: "Sekolah/institusi dan nama event wajib diisi." });
  try {
    const result = db.prepare("INSERT INTO users (name,email,password_hash,role,phone,institution,event_name) VALUES (?,?,?,?,?,?,?)")
      .run(name.trim(), normalizedEmail, makePassword(password), role, phone.trim(), institution.trim(), eventName.trim());
    createSession(result.lastInsertRowid, res);
    res.status(201).json({ user: publicUser(db.prepare("SELECT id,name,email,role,status FROM users WHERE id=?").get(result.lastInsertRowid)) });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") return res.status(409).json({ error: "Email tersebut sudah terdaftar." });
    console.error("Gagal mendaftarkan akun:", error.message);
    res.status(500).json({ error: "Pendaftaran gagal. Silakan coba kembali." });
  }
});
app.post("/api/login", (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || !checkPassword(String(req.body?.password || ""), user.password_hash)) return res.status(401).json({ error: "Email atau password tidak sesuai." });
  createSession(user.id, res);
  res.json({ user: publicUser(user) });
});
app.post("/api/google", async (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(503).json({ error: "Login Google belum dikonfigurasi. Gunakan email dan password." });
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: req.body?.credential, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (!payload?.email || !payload.email_verified) return res.status(401).json({ error: "Email Google belum terverifikasi." });
    const role = ["participant", "organizer", "judge"].includes(req.body?.role) ? req.body.role : "participant";
    if (role === "organizer" && (!req.body?.institution?.trim() || !req.body?.eventName?.trim())) {
      return res.status(400).json({ error: "Sekolah/institusi dan nama event wajib diisi untuk akun penyelenggara." });
    }
    let user = db.prepare("SELECT * FROM users WHERE email = ?").get(payload.email.toLowerCase());
    if (!user) {
      const phone = String(req.body?.phone || "").trim();
      if (!/^\+?[0-9\s().-]{8,20}$/.test(phone)) {
        return res.status(400).json({ error: "Untuk membuat akun Google baru, isi nomor telepon pada formulir pendaftaran terlebih dahulu." });
      }
      const result = db.prepare("INSERT INTO users (name,email,role,status,google_sub,phone,institution,event_name) VALUES (?,?,?,'pending',?,?,?,?)")
        .run(payload.name || payload.email, payload.email.toLowerCase(), role, payload.sub, phone, req.body?.institution?.trim() || "", req.body?.eventName?.trim() || "");
      user = db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid);
    }
    createSession(user.id, res);
    res.json({ user: publicUser(user) });
  } catch (error) {
    console.error("Verifikasi Google gagal:", error.message);
    res.status(401).json({ error: "Autentikasi Google tidak berhasil." });
  }
});
app.post("/api/logout", (req, res) => {
  const token = req.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith("rb_session="))?.slice("rb_session=".length);
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hash(decodeURIComponent(token)));
  res.clearCookie("rb_session", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  res.json({ ok: true });
});
app.post("/api/forgot-password", async (req, res) => {
  const configured = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD;
  if (!configured) return res.status(503).json({ error: "Layanan email reset belum dikonfigurasi. Admin perlu mengatur SMTP." });
  const email = String(req.body?.email || "").trim().toLowerCase();
  const user = db.prepare("SELECT id,email,name FROM users WHERE email = ?").get(email);
  if (user) {
    const token = crypto.randomBytes(32).toString("base64url");
    db.prepare("INSERT INTO password_resets (token_hash,user_id,expires_at) VALUES (?,?,?)").run(hash(token), user.id, Date.now() + 30 * 60 * 1000);
    try {
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587),
        secure: String(process.env.SMTP_SECURE).toLowerCase() === "true",
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      });
      await transport.sendMail({
        from: process.env.MAIL_FROM || process.env.SMTP_USER, to: user.email,
        subject: "Atur ulang password RekapBaris",
        text: `Halo ${user.name}, buka tautan berikut dalam 30 menit untuk mengatur ulang password Anda:\n\n${appUrl}/?reset=${token}\n\nJika Anda tidak meminta reset, abaikan email ini.`
      });
    } catch (error) {
      db.prepare("DELETE FROM password_resets WHERE token_hash = ?").run(hash(token));
      console.error("Email reset password gagal dikirim:", error.message);
      return res.status(502).json({ error: "Email reset gagal dikirim. Periksa konfigurasi SMTP." });
    }
  }
  res.json({ message: "Jika email terdaftar, instruksi reset akan dikirim. Periksa juga folder spam." });
});
app.post("/api/reset-password", (req, res) => {
  const { token, password } = req.body || {};
  if (typeof token !== "string" || String(password || "").length < 10) return res.status(400).json({ error: "Tautan atau password tidak valid. Password minimal 10 karakter." });
  const reset = db.prepare("SELECT user_id FROM password_resets WHERE token_hash=? AND expires_at>?").get(hash(token), Date.now());
  if (!reset) return res.status(400).json({ error: "Tautan reset tidak valid atau sudah kedaluwarsa." });
  const update = db.transaction(() => {
    db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(makePassword(password), reset.user_id);
    db.prepare("DELETE FROM password_resets WHERE user_id=?").run(reset.user_id);
    db.prepare("DELETE FROM sessions WHERE user_id=?").run(reset.user_id);
  });
  update();
  res.json({ message: "Password berhasil diperbarui. Silakan masuk kembali." });
});

app.get("/api/events", (req, res) => {
  const events = db.prepare("SELECT e.*, COUNT(DISTINCT c.id) AS candidate_count FROM events e LEFT JOIN candidates c ON c.event_id=e.id WHERE e.status!='pending' GROUP BY e.id ORDER BY e.starts_at").all();
  res.json({ events: events.map((event) => ({ ...event, status: currentEventStatus(event) })) });
});
app.get("/api/events/:id", (req, res) => {
  const record = db.prepare("SELECT * FROM events WHERE id=?").get(Number(req.params.id));
  if (!record || record.status === "pending") return res.status(404).json({ error: "Event tidak ditemukan." });
  const candidates = db.prepare("SELECT id,name,institution,votes FROM candidates WHERE event_id=? ORDER BY name").all(record.id);
  res.json({ event: { ...record, status: currentEventStatus(record) }, candidates });
});
app.get("/api/merchandise", (req, res) => {
  res.json({ products: db.prepare("SELECT id,name,description,price,image FROM merchandise WHERE active=1 ORDER BY id").all() });
});
app.post("/api/orders", requireAuth, requireVerified, async (req, res) => {
  const { eventId, kind, candidateId, merchId, quantity = 1, shippingAddress = "" } = req.body || {};
  if (!["ticket", "vote", "merch"].includes(kind)) return res.status(400).json({ error: "Jenis transaksi tidak valid." });
  const count = Math.min(10, Math.max(1, Number.parseInt(quantity, 10) || 1));
  const event = ["ticket", "vote"].includes(kind) ? db.prepare("SELECT * FROM events WHERE id=?").get(Number(eventId)) : null;
  if (["ticket", "vote"].includes(kind) && (!event || currentEventStatus(event) !== "available")) return res.status(400).json({ error: "Event ini belum tersedia untuk transaksi." });
  const product = kind === "merch" ? db.prepare("SELECT * FROM merchandise WHERE id=? AND active=1").get(Number(merchId)) : null;
  if (kind === "merch" && (!product || String(shippingAddress).trim().length < 10)) return res.status(400).json({ error: "Produk dan alamat pengiriman lengkap wajib diisi." });
  let candidate = null;
  if (kind === "vote") {
    candidate = db.prepare("SELECT * FROM candidates WHERE id=? AND event_id=?").get(Number(candidateId), event.id);
    if (!candidate) return res.status(400).json({ error: "Pilih peserta voting yang valid." });
  }
  const unitPrice = kind === "vote" ? Number(process.env.VOTE_PRICE || 5000) : kind === "merch" ? product.price : event.ticket_price;
  const amount = unitPrice * count;
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) return res.status(503).json({ error: "Pembayaran belum aktif. Admin perlu mengatur MIDTRANS_SERVER_KEY." });
  const orderId = `RB-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const inserted = db.prepare("INSERT INTO orders (order_id,user_id,event_id,merch_id,kind,candidate_id,quantity,amount,shipping_address) VALUES (?,?,?,?,?,?,?,?,?)")
    .run(orderId, req.user.id, event?.id || null, product?.id || null, kind, candidate?.id || null, count, amount, String(shippingAddress).trim());
  const user = db.prepare("SELECT name,email FROM users WHERE id=?").get(req.user.id);
  const base = String(process.env.MIDTRANS_IS_PRODUCTION).toLowerCase() === "true"
    ? "https://app.midtrans.com" : "https://app.sandbox.midtrans.com";
  try {
    const response = await fetch(`${base}/snap/v1/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}` },
      body: JSON.stringify({
        transaction_details: { order_id: orderId, gross_amount: amount },
        customer_details: { first_name: user.name, email: user.email },
        item_details: [{
          id: `${kind}-${event?.id || product.id}`, price: unitPrice, quantity: count,
          name: kind === "vote" ? `Voting ${candidate.name}` : kind === "merch" ? product.name : `Tiket ${event.title}`
        }],
        enabled_payments: ["qris", "gopay", "shopeepay", "bank_transfer"],
        callbacks: { finish: `${appUrl}/?payment=finish` }
      })
    });
    const result = await response.json();
    if (!response.ok || !result.token) throw new Error(result.error_messages?.join(", ") || "Midtrans Snap gagal membuat transaksi.");
    db.prepare("UPDATE orders SET snap_token=? WHERE id=?").run(result.token, inserted.lastInsertRowid);
    res.status(201).json({ orderId, snapToken: result.token, redirectUrl: `${base}/snap/v2/vtweb/${result.token}` });
  } catch (error) {
    db.prepare("UPDATE orders SET status='failed' WHERE id=?").run(inserted.lastInsertRowid);
    console.error("Pembuatan transaksi Midtrans gagal:", error.message);
    res.status(502).json({ error: "Pembayaran gagal disiapkan. Silakan coba kembali." });
  }
});
app.post("/api/payments/notification", (req, res) => {
  const { order_id: orderId, status_code: statusCode, gross_amount: grossAmount, signature_key: signature } = req.body || {};
  if (!process.env.MIDTRANS_SERVER_KEY) return res.status(503).json({ error: "Midtrans belum dikonfigurasi." });
  const expected = crypto.createHash("sha512").update(`${orderId}${statusCode}${grossAmount}${process.env.MIDTRANS_SERVER_KEY}`).digest("hex");
  const supplied = Buffer.from(String(signature || ""));
  const expectedBuffer = Buffer.from(expected);
  if (supplied.length !== expectedBuffer.length || !crypto.timingSafeEqual(supplied, expectedBuffer)) return res.status(403).json({ error: "Signature not valid." });
  const order = db.prepare("SELECT * FROM orders WHERE order_id=?").get(orderId);
  if (!order || Number(grossAmount) !== order.amount) return res.status(404).json({ error: "Order not found." });
  const transactionStatus = req.body.transaction_status;
  const fraudStatus = req.body.fraud_status;
  let status = "pending";
  if (transactionStatus === "settlement" || (transactionStatus === "capture" && fraudStatus === "accept")) status = "paid";
  else if (["deny", "cancel", "expire", "failure"].includes(transactionStatus)) status = "failed";
  const update = db.transaction(() => {
    const previous = db.prepare("SELECT status FROM orders WHERE id=?").get(order.id);
    if (previous.status === "paid") return;
    db.prepare("UPDATE orders SET status=? WHERE id=?").run(status, order.id);
    if (status === "paid" && previous.status !== "paid") {
      if (order.kind === "vote") db.prepare("UPDATE candidates SET votes=votes+? WHERE id=?").run(order.quantity, order.candidate_id);
      else if (order.kind === "ticket") db.prepare("UPDATE events SET popularity=popularity+1 WHERE id=?").run(order.event_id);
      else db.prepare("UPDATE merchandise SET purchased=purchased+? WHERE id=?").run(order.quantity, order.merch_id);
    }
  });
  update();
  res.json({ ok: true });
});
app.get("/api/judge/scores", requireAuth, requireVerified, (req, res) => {
  if (req.user.role !== "judge") return res.status(403).json({ error: "Fitur penilaian khusus akun Juri." });
  const events = db.prepare(`
    SELECT e.id AS event_id,e.title AS event_title,e.starts_at,e.status AS event_status,
      c.id AS candidate_id,c.name AS candidate_name,c.institution,
      s.score,s.notes
    FROM events e JOIN candidates c ON c.event_id=e.id
    LEFT JOIN scores s ON s.candidate_id=c.id AND s.judge_id=?
    WHERE e.status NOT IN ('completed','pending') ORDER BY e.starts_at,c.name
  `).all(req.user.id).filter((event) => currentEventStatus({ starts_at: event.starts_at, status: event.event_status }) !== "completed");
  res.json({ entries: events });
});
app.post("/api/judge/scores", requireAuth, requireVerified, (req, res) => {
  if (req.user.role !== "judge") return res.status(403).json({ error: "Fitur penilaian khusus akun Juri." });
  const { candidateId, score, notes = "" } = req.body || {};
  const value = Number(score);
  const candidate = db.prepare("SELECT c.id,c.event_id,e.status,e.starts_at FROM candidates c JOIN events e ON e.id=c.event_id WHERE c.id=? AND e.status NOT IN ('completed','pending')").get(Number(candidateId));
  if (candidate && currentEventStatus(candidate) === "completed") return res.status(400).json({ error: "Penilaian event ini sudah ditutup." });
  if (!candidate || !Number.isInteger(value) || value < 1 || value > 100 || String(notes).length > 500) {
    return res.status(400).json({ error: "Pilih peserta yang valid. Nilai harus 1–100 dan catatan maksimal 500 karakter." });
  }
  db.prepare(`INSERT INTO scores (event_id,candidate_id,judge_id,score,notes) VALUES (?,?,?,?,?)
    ON CONFLICT(candidate_id,judge_id) DO UPDATE SET score=excluded.score,notes=excluded.notes,updated_at=CURRENT_TIMESTAMP`)
    .run(candidate.event_id, candidate.id, req.user.id, value, String(notes).trim());
  res.json({ ok: true });
});

app.get("/api/admin/overview", requireAuth, requireStaff, (req, res) => {
  res.json({
    stats: {
      users: db.prepare("SELECT COUNT(*) AS n FROM users WHERE role NOT IN ('admin','team')").get().n,
      pending: db.prepare("SELECT COUNT(*) AS n FROM users WHERE status='pending'").get().n,
      events: db.prepare("SELECT COUNT(*) AS n FROM events").get().n,
      revenue: db.prepare("SELECT COALESCE(SUM(amount),0) AS n FROM orders WHERE status='paid'").get().n
    },
    users: db.prepare("SELECT * FROM users ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END,created_at DESC LIMIT 100").all().map(accountView),
    events: db.prepare("SELECT * FROM events ORDER BY starts_at DESC").all(),
    orders: db.prepare(`SELECT o.order_id,o.kind,o.quantity,o.amount,o.status,o.created_at,o.shipping_address,
      u.name AS customer_name,u.email AS customer_email,e.title AS event_title,m.name AS product_name
      FROM orders o JOIN users u ON u.id=o.user_id
      LEFT JOIN events e ON e.id=o.event_id LEFT JOIN merchandise m ON m.id=o.merch_id
      ORDER BY o.created_at DESC LIMIT 100`).all()
  });
  app.get("/api/organizer/overview", requireAuth, requireVerified, (req, res) => {
    if (req.user.role !== "organizer") return res.status(403).json({ error: "Akses khusus akun penyelenggara event." });
    const events = db.prepare("SELECT * FROM events WHERE owner_id=? ORDER BY starts_at DESC").all(req.user.id);
    res.json({ events });
  });
});
app.post("/api/admin/users/:id/verify", requireAuth, requireStaff, (req, res) => {
  const result = db.prepare("UPDATE users SET status='verified' WHERE id=? AND role NOT IN ('admin','team')").run(Number(req.params.id));
  if (!result.changes) return res.status(404).json({ error: "Akun tidak ditemukan." });
  res.json({ ok: true });
});
app.post("/api/admin/events", requireAuth, requireAdmin, (req, res) => {
  const { title, category, description, venue, startsAt, ticketPrice, poster, candidates = "" } = req.body || {};
  if (![title, category, description, venue, startsAt].every((value) => typeof value === "string" && value.trim()) || !Number.isFinite(Number(ticketPrice)) || Number(ticketPrice) < 0) {
    return res.status(400).json({ error: "Lengkapi nama, kategori, deskripsi, lokasi, tanggal, dan harga tiket yang valid." });
  }
  const addEvent = db.transaction(() => {
    const result = db.prepare("INSERT INTO events (title,category,description,venue,starts_at,status,poster,ticket_price,owner_id) VALUES (?,?,?,?,?,'available',?,?,NULL)")
      .run(title.trim(), category.trim(), description.trim(), venue.trim(), startsAt, String(poster || "").trim(), Math.round(Number(ticketPrice)));
    const addCandidate = db.prepare("INSERT INTO candidates (event_id,name,institution) VALUES (?,?,?)");
    for (const line of String(candidates).split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
      const [name, institution = ""] = line.split("|").map((item) => item.trim());
      if (name) addCandidate.run(result.lastInsertRowid, name, institution);
    }
    return result;
  });
  res.status(201).json({ id: addEvent().lastInsertRowid });
});
app.post("/api/organizer/events", requireAuth, requireVerified, (req, res) => {
  if (req.user.role !== "organizer") return res.status(403).json({ error: "Akses khusus akun penyelenggara event." });
  const { title, category, description, venue, startsAt, ticketPrice, poster, candidates = "" } = req.body || {};
  if (![title, category, description, venue, startsAt].every((value) => typeof value === "string" && value.trim()) || !Number.isFinite(Number(ticketPrice)) || Number(ticketPrice) < 0) {
    return res.status(400).json({ error: "Lengkapi nama, kategori, deskripsi, lokasi, tanggal, dan harga tiket yang valid." });
  }
  const addEvent = db.transaction(() => {
    const result = db.prepare("INSERT INTO events (title,category,description,venue,starts_at,status,poster,ticket_price,owner_id) VALUES (?,?,?,?,?,'pending',?,?,?)")
      .run(title.trim(), category.trim(), description.trim(), venue.trim(), startsAt, String(poster || "").trim(), Math.round(Number(ticketPrice)), req.user.id);
    const addCandidate = db.prepare("INSERT INTO candidates (event_id,name,institution) VALUES (?,?,?)");
    for (const line of String(candidates).split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
      const [name, institution = ""] = line.split("|").map((item) => item.trim());
      if (name) addCandidate.run(result.lastInsertRowid, name, institution);
    }
    return result;
  });
  res.status(201).json({ id: addEvent().lastInsertRowid, status: "pending" });
});
app.post("/api/admin/events/:id/verify", requireAuth, requireStaff, (req, res) => {
  const result = db.prepare("UPDATE events SET status='available' WHERE id=? AND status='pending'").run(Number(req.params.id));
  if (!result.changes) return res.status(404).json({ error: "Pengajuan event tidak ditemukan." });
  res.json({ ok: true });
});
app.post("/api/admin/accounts", requireAuth, requireAdmin, (req, res) => {
  const { name, email, password, role } = req.body || {};
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!name?.trim() || !validEmail(normalizedEmail) || String(password || "").length < 12 || !["team", "admin"].includes(role)) {
    return res.status(400).json({ error: "Nama, email valid, password minimal 12 karakter, dan peran admin/tim wajib diisi." });
  }
  try {
    const result = db.prepare("INSERT INTO users (name,email,password_hash,role,status) VALUES (?,?,?,?, 'verified')")
      .run(name.trim(), normalizedEmail, makePassword(password), role);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") return res.status(409).json({ error: "Email sudah digunakan." });
    console.error("Gagal membuat akun staf:", error.message);
    res.status(500).json({ error: "Akun staf gagal dibuat." });
  }
});
app.post("/api/staff/profile", requireAuth, requireStaff, (req, res) => {
  const { name, email, currentPassword, newPassword = "" } = req.body || {};
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const current = db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id);
  if (!checkPassword(String(currentPassword || ""), current.password_hash)) return res.status(401).json({ error: "Password saat ini tidak sesuai." });
  if (!name?.trim() || !validEmail(normalizedEmail) || (newPassword && String(newPassword).length < 10)) {
    return res.status(400).json({ error: "Nama, email valid, dan password baru minimal 10 karakter wajib diisi jika ingin menggantinya." });
  }
  try {
    const cookie = req.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith("rb_session="))?.slice("rb_session=".length);
    const currentSession = cookie ? hash(decodeURIComponent(cookie)) : "";
    db.prepare("UPDATE users SET name=?,email=?,password_hash=? WHERE id=?")
      .run(name.trim(), normalizedEmail, newPassword ? makePassword(newPassword) : current.password_hash, req.user.id);
    if (newPassword) db.prepare("DELETE FROM sessions WHERE user_id=? AND token_hash!=?").run(req.user.id, currentSession);
    res.json({ user: publicUser(db.prepare("SELECT id,name,email,role,status FROM users WHERE id=?").get(req.user.id)) });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") return res.status(409).json({ error: "Email tersebut sudah digunakan." });
    console.error("Gagal memperbarui profil staf:", error.message);
    res.status(500).json({ error: "Perubahan akun gagal disimpan." });
  }
});
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));
app.use((error, req, res, next) => {
  console.error("Kesalahan server:", error.message);
  res.status(500).json({ error: "Terjadi kesalahan pada server." });
});
app.listen(port, () => console.log(`RekapBaris berjalan di ${appUrl}`));
