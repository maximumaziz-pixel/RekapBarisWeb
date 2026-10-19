require("dotenv").config();

const crypto = require("node:crypto");
const path = require("node:path");
const express = require("express");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const midtransClient = require("midtrans-client");
const { PrismaClient } = require("@prisma/client");
const { z } = require("zod");

const app = express();
const prisma = new PrismaClient();
const port = Number(process.env.PORT || 3000);
const production = process.env.NODE_ENV === "production";
const cookieName = "rb_session";
const jwtSecret = process.env.JWT_SECRET || "";
const phonePattern = /^\+?[1-9]\d{8,14}$/;

if (jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must contain at least 32 characters.");
}

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://app.sandbox.midtrans.com", "https://app.midtrans.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https://api.sandbox.midtrans.com", "https://api.midtrans.com"],
      frameSrc: ["'self'", "https://app.sandbox.midtrans.com", "https://app.midtrans.com"]
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: "32kb" }));
app.use(cookieParser());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Terlalu banyak percobaan. Silakan coba lagi beberapa saat." }
});
const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false
});

const midtrans = new midtransClient.Snap({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
  serverKey: process.env.MIDTRANS_SERVER_KEY || "",
  clientKey: process.env.MIDTRANS_CLIENT_KEY || ""
});

function apiError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    const message = result.error.issues.map((issue) => issue.message).join(", ");
    throw apiError(400, message || "Data yang dikirim tidak valid.");
  }
  return result.data;
}

function normalizePhone(phone) {
  return phone.replace(/[^\d+]/g, "").replace(/^\+/, "");
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: user.status
  };
}

function signIn(res, user) {
  const token = jwt.sign({ sub: user.id }, jwtSecret, { expiresIn: "7d", issuer: "rekapbaris.com" });
  res.cookie(cookieName, token, {
    httpOnly: true,
    secure: production || process.env.COOKIE_SECURE === "true",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

async function requireAuth(req, res, next) {
  try {
    const token = req.cookies[cookieName];
    if (!token) throw apiError(401, "Silakan masuk terlebih dahulu.");
    const payload = jwt.verify(token, jwtSecret, { issuer: "rekapbaris.com" });
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== "ACTIVE") {
      res.clearCookie(cookieName, { path: "/" });
      throw apiError(401, "Akun belum aktif atau sudah tidak tersedia.");
    }
    req.user = user;
    next();
  } catch (error) {
    next(error.status ? error : apiError(401, "Sesi tidak valid. Silakan masuk kembali."));
  }
}

function requireStaff(req, res, next) {
  if (!req.user || !["ADMIN", "TEAM"].includes(req.user.role)) {
    return next(apiError(403, "Akses khusus Admin atau Tim Rekap."));
  }
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "ADMIN") return next(apiError(403, "Akses khusus Admin."));
  next();
}

function otpHash(code) {
  return crypto.createHmac("sha256", jwtSecret).update(code).digest("hex");
}

async function sendOtp(phone, code) {
  const token = process.env.FONNTE_TOKEN;
  if (!token) throw apiError(503, "Layanan OTP belum dikonfigurasi. Hubungi administrator.");
  const body = new URLSearchParams({
    target: phone,
    message: `Kode verifikasi Rekap Baris Anda: ${code}. Berlaku 5 menit. Jangan bagikan kode ini kepada siapa pun.`,
    countryCode: "62"
  });
  const response = await fetch("https://api.fonnte.com/send", {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(12000)
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.status !== true) {
    console.error("Fonnte delivery failed:", result?.reason || response.status);
    throw apiError(502, "OTP WhatsApp tidak dapat dikirim. Periksa nomor atau coba lagi.");
  }
}

async function createAndSendOtp(user) {
  const recentChallenges = await prisma.otpChallenge.count({
    where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 15 * 60 * 1000) } }
  });
  if (recentChallenges >= 4) throw apiError(429, "Batas permintaan OTP tercapai. Coba lagi setelah 15 menit.");
  const code = String(crypto.randomInt(100000, 1000000));
  const now = new Date();
  await prisma.otpChallenge.updateMany({
    where: { userId: user.id, consumedAt: null },
    data: { consumedAt: now }
  });
  await prisma.otpChallenge.create({
    data: {
      userId: user.id,
      codeHash: otpHash(code),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000)
    }
  });
  await sendOtp(user.phone, code);
}

async function requireMidtrans() {
  if (!process.env.MIDTRANS_SERVER_KEY || !process.env.MIDTRANS_CLIENT_KEY) {
    throw apiError(503, "Pembayaran belum dikonfigurasi. Silakan hubungi penyelenggara.");
  }
}

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().transform(normalizePhone).refine((value) => phonePattern.test(value), "Nomor WhatsApp tidak valid."),
  password: z.string().min(12, "Kata sandi minimal 12 karakter.").max(128),
  role: z.enum(["PARTICIPANT", "ORGANIZER", "JUDGE"]),
  institution: z.string().trim().max(120).optional(),
  eventName: z.string().trim().max(150).optional()
});
const phoneSchema = z.object({
  phone: z.string().trim().transform(normalizePhone).refine((value) => phonePattern.test(value), "Nomor WhatsApp tidak valid.")
});
const otpSchema = phoneSchema.extend({ code: z.string().regex(/^\d{6}$/, "Kode OTP harus terdiri dari 6 angka.") });
const eventSchema = z.object({
  name: z.string().trim().min(3).max(150),
  institution: z.string().trim().min(2).max(120),
  description: z.string().trim().max(3000).optional(),
  posterUrl: z.string().trim().url().max(1000).refine((value) => value.startsWith("https://"), "Poster harus menggunakan HTTPS.").optional().or(z.literal("")),
  startsAt: z.string().datetime().optional().or(z.literal("")),
  endsAt: z.string().datetime().optional().or(z.literal("")),
  location: z.string().trim().max(200).optional(),
  ticketPrice: z.number().int().min(0).max(100000000).default(0),
  votePrice: z.number().int().min(1000).max(10000000).default(1000)
}).refine((event) => !event.startsAt || !event.endsAt || new Date(event.endsAt) > new Date(event.startsAt), {
  message: "Waktu selesai event harus setelah waktu mulai."
});

app.get("/api/health", asyncRoute(async (req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ ok: true, service: "rekapbaris-api" });
}));

app.post("/api/auth/register", authLimiter, asyncRoute(async (req, res) => {
  const input = parse(registerSchema, req.body);
  if (input.role === "ORGANIZER" && (!input.institution || !input.eventName)) {
    throw apiError(400, "Penyelenggara harus mengisi sekolah/institusi dan nama event.");
  }
  const passwordHash = await bcrypt.hash(input.password, 12);
  let user;
  try {
    user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          name: input.name,
          email: input.email.toLowerCase(),
          phone: input.phone,
          passwordHash,
          role: input.role
        }
      });
      if (input.role === "ORGANIZER") {
        await tx.event.create({
          data: {
            organizerId: createdUser.id,
            name: input.eventName,
            institution: input.institution
          }
        });
      }
      return createdUser;
    });
  } catch (error) {
    if (error.code === "P2002") throw apiError(409, "Email atau nomor WhatsApp sudah terdaftar.");
    throw error;
  }
  await createAndSendOtp(user);
  res.status(201).json({ message: "Kode OTP dikirim ke WhatsApp. Akun menunggu verifikasi Admin/Tim Rekap." });
}));

app.post("/api/auth/otp/request", authLimiter, asyncRoute(async (req, res) => {
  const input = parse(phoneSchema, req.body);
  const user = await prisma.user.findUnique({ where: { phone: input.phone } });
  if (user && (user.status === "ACTIVE" || (user.status === "PENDING" && !user.phoneVerifiedAt))) {
    await createAndSendOtp(user);
  }
  res.json({ message: "Jika nomor terdaftar dan aktif, kode OTP akan dikirim melalui WhatsApp." });
}));

app.post("/api/auth/otp/verify", authLimiter, asyncRoute(async (req, res) => {
  const input = parse(otpSchema, req.body);
  const user = await prisma.user.findUnique({ where: { phone: input.phone } });
  if (!user) throw apiError(400, "Nomor atau kode OTP tidak valid.");
  const challenge = await prisma.otpChallenge.findFirst({
    where: { userId: user.id, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" }
  });
  if (!challenge || challenge.attempts >= 5) throw apiError(400, "Kode OTP tidak valid atau sudah kedaluwarsa.");
  const valid = crypto.timingSafeEqual(Buffer.from(challenge.codeHash), Buffer.from(otpHash(input.code)));
  if (!valid) {
    await prisma.otpChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
    throw apiError(400, "Kode OTP tidak valid atau sudah kedaluwarsa.");
  }
  await prisma.$transaction([
    prisma.otpChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } }),
    prisma.user.update({ where: { id: user.id }, data: { phoneVerifiedAt: user.phoneVerifiedAt || new Date() } })
  ]);
  if (user.status !== "ACTIVE") {
    return res.status(403).json({ error: "Nomor terverifikasi. Akun Anda masih menunggu verifikasi Admin/Tim Rekap." });
  }
  signIn(res, user);
  res.json({ user: publicUser(user) });
}));

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie(cookieName, { httpOnly: true, secure: production || process.env.COOKIE_SECURE === "true", sameSite: "lax", path: "/" });
  res.status(204).end();
});

app.get("/api/auth/me", requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

app.post("/api/auth/password", requireAuth, asyncRoute(async (req, res) => {
  const input = parse(z.object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(12).max(128)
  }), req.body);
  const valid = await bcrypt.compare(input.currentPassword, req.user.passwordHash);
  if (!valid) throw apiError(400, "Kata sandi saat ini tidak sesuai.");
  const passwordHash = await bcrypt.hash(input.newPassword, 12);
  await prisma.user.update({ where: { id: req.user.id }, data: { passwordHash } });
  res.json({ message: "Kata sandi berhasil diperbarui." });
}));

app.post("/api/auth/forgot-password", authLimiter, asyncRoute(async (req, res) => {
  const input = parse(z.object({ email: z.string().trim().email().max(254) }), req.body);
  const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (!user) return res.json({ message: "Jika email terdaftar, tautan pemulihan akan dikirim." });
  const { RESEND_API_KEY, EMAIL_FROM, APP_URL } = process.env;
  if (!RESEND_API_KEY || !EMAIL_FROM || !APP_URL) {
    throw apiError(503, "Pemulihan email belum dikonfigurasi. Hubungi administrator.");
  }
  const rawToken = crypto.randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: crypto.createHash("sha256").update(rawToken).digest("hex"),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    }
  });
  const link = new URL(`/reset-password?token=${rawToken}`, APP_URL).toString();
  const emailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [user.email],
      subject: "Pemulihan kata sandi Rekap Baris",
      text: `Gunakan tautan berikut dalam 30 menit untuk mengatur ulang kata sandi: ${link}`
    }),
    signal: AbortSignal.timeout(12000)
  });
  if (!emailResponse.ok) {
    console.error("Password reset email delivery failed:", emailResponse.status);
    throw apiError(502, "Email pemulihan tidak dapat dikirim saat ini. Silakan coba lagi.");
  }
  res.json({ message: "Jika email terdaftar, tautan pemulihan akan dikirim." });
}));

app.post("/api/auth/reset-password", authLimiter, asyncRoute(async (req, res) => {
  const input = parse(z.object({
    token: z.string().min(32).max(200),
    password: z.string().min(12).max(128)
  }), req.body);
  const tokenHash = crypto.createHash("sha256").update(input.token).digest("hex");
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt <= new Date()) throw apiError(400, "Tautan pemulihan tidak valid atau sudah kedaluwarsa.");
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash: await bcrypt.hash(input.password, 12) } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } })
  ]);
  res.json({ message: "Kata sandi berhasil diubah. Silakan masuk menggunakan OTP WhatsApp." });
}));

app.get("/api/events", publicLimiter, asyncRoute(async (req, res) => {
  const events = await prisma.event.findMany({
    where: { status: "APPROVED" },
    orderBy: [{ startsAt: "asc" }, { createdAt: "desc" }],
    include: { _count: { select: { registrations: { where: { status: "APPROVED" } } } } }
  });
  const eventIds = events.map((event) => event.id);
  const voteCounts = eventIds.length ? await prisma.payment.groupBy({
    by: ["eventId"],
    where: { eventId: { in: eventIds }, type: "VOTE", status: "SETTLED" },
    _sum: { quantity: true }
  }) : [];
  const voteMap = new Map(voteCounts.map((row) => [row.eventId, row._sum.quantity || 0]));
  res.json({ events: events.map((event) => ({
    id: event.id,
    name: event.name,
    institution: event.institution,
    description: event.description,
    posterUrl: event.posterUrl,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    createdAt: event.createdAt,
    location: event.location,
    ticketPrice: event.ticketPrice,
    votePrice: event.votePrice,
    participants: event._count.registrations,
    votes: voteMap.get(event.id) || 0
  })) });
}));

app.get("/api/events/:id", publicLimiter, asyncRoute(async (req, res) => {
  const event = await prisma.event.findFirst({
    where: { id: req.params.id, status: "APPROVED" },
    include: { registrations: { where: { status: "APPROVED" }, orderBy: { participantName: "asc" } } }
  });
  if (!event) throw apiError(404, "Event tidak ditemukan.");
  const counts = await prisma.payment.groupBy({
    by: ["registrationId"],
    where: { eventId: event.id, type: "VOTE", status: "SETTLED", registrationId: { not: null } },
    _sum: { quantity: true }
  });
  const votes = new Map(counts.map((row) => [row.registrationId, row._sum.quantity || 0]));
  res.json({ event: {
    id: event.id,
    name: event.name,
    institution: event.institution,
    description: event.description,
    posterUrl: event.posterUrl,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    location: event.location,
    ticketPrice: event.ticketPrice,
    votePrice: event.votePrice,
    participants: event.registrations.map((registration) => ({
      id: registration.id,
      name: registration.participantName,
      teamName: registration.teamName,
      votes: votes.get(registration.id) || 0
    }))
  } });
}));

app.post("/api/events", requireAuth, asyncRoute(async (req, res) => {
  if (!["ORGANIZER", "ADMIN", "TEAM"].includes(req.user.role)) throw apiError(403, "Hanya penyelenggara atau staf yang dapat mengajukan event.");
  const input = parse(eventSchema, req.body);
  const event = await prisma.event.create({
    data: {
      ...input,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      organizerId: req.user.id,
      status: req.user.role === "ADMIN" ? "APPROVED" : "PENDING"
    }
  });
  res.status(201).json({ event });
}));

app.post("/api/events/:id/register", requireAuth, asyncRoute(async (req, res) => {
  const input = parse(z.object({
    participantName: z.string().trim().min(2).max(100),
    teamName: z.string().trim().max(120).optional()
  }), req.body);
  const event = await prisma.event.findFirst({ where: { id: req.params.id, status: "APPROVED" }, select: { id: true } });
  if (!event) throw apiError(404, "Event tidak ditemukan atau belum tersedia.");
  try {
    const registration = await prisma.eventRegistration.create({
      data: {
        eventId: event.id,
        userId: req.user.id,
        participantName: input.participantName,
        teamName: input.teamName || ""
      }
    });
    res.status(201).json({ registration, message: "Pendaftaran peserta menunggu verifikasi penyelenggara/Admin." });
  } catch (error) {
    if (error.code === "P2002") throw apiError(409, "Nama peserta tersebut sudah terdaftar pada event ini.");
    throw error;
  }
}));

app.get("/api/merch", publicLimiter, asyncRoute(async (req, res) => {
  const products = await prisma.product.findMany({
    where: { active: true },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, description: true, imageUrl: true, price: true, stock: true }
  });
  res.json({ products });
}));

async function createPayment(req, res, type) {
  await requireMidtrans();
  const input = parse(z.object({
    quantity: z.number().int().min(1).max(10).default(1),
    eventId: z.string().optional(),
    registrationId: z.string().optional(),
    productId: z.string().optional()
  }), req.body);
  let event = null;
  let product = null;
  let unitPrice = 0;
  if (type === "TICKET" || type === "VOTE") {
    if (!input.eventId) throw apiError(400, "Event wajib dipilih.");
    event = await prisma.event.findFirst({ where: { id: input.eventId, status: "APPROVED" } });
    if (!event) throw apiError(404, "Event tidak ditemukan atau belum tersedia.");
    if (type === "TICKET") unitPrice = event.ticketPrice;
    if (type === "VOTE") {
      if (!input.registrationId) throw apiError(400, "Peserta yang akan divoting wajib dipilih.");
      const registration = await prisma.eventRegistration.findFirst({
        where: { id: input.registrationId, eventId: event.id, status: "APPROVED" }
      });
      if (!registration) throw apiError(404, "Peserta tidak ditemukan atau belum tersedia untuk voting.");
      if (registration.userId === req.user.id) throw apiError(400, "Anda tidak dapat membeli vote untuk akun peserta sendiri.");
      unitPrice = event.votePrice;
    }
  } else {
    if (!input.productId) throw apiError(400, "Produk wajib dipilih.");
    product = await prisma.product.findFirst({ where: { id: input.productId, active: true } });
    if (!product) throw apiError(404, "Produk tidak ditemukan.");
    unitPrice = product.price;
  }
  if (unitPrice < 1) throw apiError(400, "Harga belum tersedia untuk transaksi ini.");
  const amount = unitPrice * input.quantity;
  const orderId = `rb_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
  let payment;
  try {
    payment = await prisma.$transaction(async (tx) => {
      if (product) {
        const stock = await tx.product.updateMany({
          where: { id: product.id, active: true, stock: { gte: input.quantity } },
          data: { stock: { decrement: input.quantity } }
        });
        if (stock.count !== 1) throw apiError(409, "Stok produk tidak mencukupi.");
      }
      return tx.payment.create({
        data: {
          orderId,
          userId: req.user.id,
          type,
          amount,
          quantity: input.quantity,
          eventId: event?.id,
          registrationId: type === "VOTE" ? input.registrationId : undefined,
          productId: product?.id
        }
      });
    });
  } catch (error) {
    throw error;
  }
  try {
    const transaction = await midtrans.createTransaction({
      transaction_details: { order_id: orderId, gross_amount: amount },
      customer_details: { first_name: req.user.name, email: req.user.email, phone: req.user.phone },
      item_details: [{
        id: type === "MERCH" ? product.id : (event?.id || type.toLowerCase()),
        price: unitPrice,
        quantity: input.quantity,
        name: type === "MERCH" ? product.name : `${type === "VOTE" ? "Vote" : "Tiket"} ${event.name}`.slice(0, 50)
      }],
      enabled_payments: ["qris"]
    });
    res.status(201).json({
      paymentId: payment.id,
      orderId,
      token: transaction.token,
      redirectUrl: transaction.redirect_url,
      clientKey: process.env.MIDTRANS_CLIENT_KEY,
      isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true"
    });
  } catch (error) {
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
      if (product) await tx.product.update({ where: { id: product.id }, data: { stock: { increment: input.quantity } } });
    });
    console.error("Midtrans transaction creation failed:", error.message);
    throw apiError(502, "Transaksi QRIS tidak dapat dibuat. Silakan coba kembali.");
  }
}

app.post("/api/payments/ticket", requireAuth, asyncRoute((req, res) => createPayment(req, res, "TICKET")));
app.post("/api/payments/vote", requireAuth, asyncRoute((req, res) => createPayment(req, res, "VOTE")));
app.post("/api/payments/merch", requireAuth, asyncRoute((req, res) => createPayment(req, res, "MERCH")));

app.get("/api/payments/:id", requireAuth, asyncRoute(async (req, res) => {
  const payment = await prisma.payment.findFirst({
    where: { id: req.params.id, userId: req.user.id },
    select: { id: true, orderId: true, type: true, amount: true, quantity: true, status: true, createdAt: true }
  });
  if (!payment) throw apiError(404, "Transaksi tidak ditemukan.");
  res.json({ payment });
}));

app.post("/api/payments/midtrans/notification", asyncRoute(async (req, res) => {
  const body = parse(z.object({
    order_id: z.string().min(1),
    status_code: z.string().min(1),
    gross_amount: z.string().min(1),
    signature_key: z.string().regex(/^[a-f\d]{128}$/i),
    transaction_status: z.string(),
    fraud_status: z.string().optional(),
    transaction_id: z.string().optional()
  }), req.body);
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) throw apiError(503, "Webhook pembayaran belum dikonfigurasi.");
  const expected = crypto.createHash("sha512")
    .update(`${body.order_id}${body.status_code}${body.gross_amount}${serverKey}`)
    .digest("hex");
  const providedBuffer = Buffer.from(body.signature_key.toLowerCase());
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    throw apiError(403, "Signature webhook tidak valid.");
  }
  const settled = body.transaction_status === "settlement" ||
    (body.transaction_status === "capture" && body.fraud_status !== "challenge");
  const failed = ["deny", "cancel", "expire"].includes(body.transaction_status) ||
    (body.transaction_status === "capture" && body.fraud_status === "challenge");
  if (!settled && !failed) return res.json({ ok: true });
  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { orderId: body.order_id } });
    if (!payment || payment.status !== "PENDING") return;
    const amount = Number(body.gross_amount);
    if (!Number.isSafeInteger(amount) || amount !== payment.amount) {
      throw apiError(400, "Nilai pembayaran tidak sesuai dengan transaksi.");
    }
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: settled ? "SETTLED" : "FAILED",
        settledAt: settled ? new Date() : null,
        midtransTransactionId: body.transaction_id
      }
    });
    if (failed && payment.productId) {
      await tx.product.update({
        where: { id: payment.productId },
        data: { stock: { increment: payment.quantity } }
      });
    }
  });
  res.json({ ok: true });
}));

app.get("/api/admin/summary", requireAuth, requireStaff, asyncRoute(async (req, res) => {
  const [users, pendingUsers, events, pendingEvents, judges, payments] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: "PENDING" } }),
    prisma.event.count(),
    prisma.event.count({ where: { status: "PENDING" } }),
    prisma.user.count({ where: { role: "JUDGE" } }),
    prisma.payment.aggregate({ where: { status: "SETTLED" }, _sum: { amount: true }, _count: true })
  ]);
  res.json({ summary: { users, pendingUsers, events, pendingEvents, judges, settledPayments: payments._count, revenue: payments._sum.amount || 0 } });
}));

app.get("/api/admin/users", requireAuth, requireStaff, asyncRoute(async (req, res) => {
  const status = ["PENDING", "ACTIVE", "REJECTED"].includes(req.query.status) ? req.query.status : undefined;
  const users = await prisma.user.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, name: true, email: true, phone: true, role: true, status: true, phoneVerifiedAt: true, createdAt: true }
  });
  res.json({ users });
}));

app.patch("/api/admin/users/:id/status", requireAuth, requireStaff, asyncRoute(async (req, res) => {
  const input = parse(z.object({ status: z.enum(["ACTIVE", "REJECTED"]) }), req.body);
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target || ["ADMIN", "TEAM"].includes(target.role)) throw apiError(404, "Akun tidak ditemukan.");
  if (input.status === "ACTIVE" && !target.phoneVerifiedAt) throw apiError(400, "Akun harus menyelesaikan OTP WhatsApp sebelum diverifikasi.");
  const user = await prisma.user.update({ where: { id: target.id }, data: { status: input.status } });
  res.json({ user: publicUser(user) });
}));

app.get("/api/admin/events", requireAuth, requireStaff, asyncRoute(async (req, res) => {
  const status = ["PENDING", "APPROVED", "REJECTED", "COMPLETED"].includes(req.query.status) ? req.query.status : undefined;
  const events = await prisma.event.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: "desc" },
    include: {
      organizer: { select: { name: true, email: true } },
      _count: { select: { registrations: true } }
    }
  });
  res.json({ events });
}));

app.patch("/api/admin/events/:id/status", requireAuth, requireStaff, asyncRoute(async (req, res) => {
  const input = parse(z.object({ status: z.enum(["APPROVED", "REJECTED", "COMPLETED"]) }), req.body);
  const event = await prisma.event.update({ where: { id: req.params.id }, data: { status: input.status } })
    .catch((error) => {
      if (error.code === "P2025") throw apiError(404, "Event tidak ditemukan.");
      throw error;
    });
  res.json({ event });
}));

app.get("/api/admin/events/:id/participants", requireAuth, requireStaff, asyncRoute(async (req, res) => {
  const registrations = await prisma.eventRegistration.findMany({
    where: { eventId: req.params.id },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { email: true, phone: true } } }
  });
  res.json({ registrations });
}));

app.patch("/api/admin/registrations/:id/status", requireAuth, requireStaff, asyncRoute(async (req, res) => {
  const input = parse(z.object({ status: z.enum(["APPROVED", "REJECTED"]) }), req.body);
  const registration = await prisma.eventRegistration.update({ where: { id: req.params.id }, data: { status: input.status } })
    .catch((error) => {
      if (error.code === "P2025") throw apiError(404, "Pendaftaran peserta tidak ditemukan.");
      throw error;
    });
  res.json({ registration });
}));

app.get("/api/admin/payments", requireAuth, requireStaff, asyncRoute(async (req, res) => {
  const payments = await prisma.payment.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { name: true, email: true } }, event: { select: { name: true } }, product: { select: { name: true } } }
  });
  res.json({ payments });
}));

app.get("/api/admin/products", requireAuth, requireStaff, asyncRoute(async (req, res) => {
  const products = await prisma.product.findMany({ orderBy: { createdAt: "desc" } });
  res.json({ products });
}));

app.post("/api/admin/products", requireAuth, requireStaff, asyncRoute(async (req, res) => {
  const input = parse(z.object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(2000).optional(),
    imageUrl: z.string().trim().url().max(1000).optional().or(z.literal("")),
    price: z.number().int().min(1).max(100000000),
    stock: z.number().int().min(0).max(100000)
  }), req.body);
  const product = await prisma.product.create({ data: input });
  res.status(201).json({ product });
}));

app.patch("/api/admin/products/:id", requireAuth, requireStaff, asyncRoute(async (req, res) => {
  const input = parse(z.object({
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(2000).optional(),
    imageUrl: z.string().trim().url().max(1000).optional().or(z.literal("")),
    price: z.number().int().min(1).max(100000000).optional(),
    stock: z.number().int().min(0).max(100000).optional(),
    active: z.boolean().optional()
  }), req.body);
  const product = await prisma.product.update({ where: { id: req.params.id }, data: input })
    .catch((error) => {
      if (error.code === "P2025") throw apiError(404, "Produk tidak ditemukan.");
      throw error;
    });
  res.json({ product });
}));

app.use("/api", (req, res) => res.status(404).json({ error: "API tidak ditemukan." }));

const distPath = path.join(__dirname, "dist");
app.use(express.static(distPath, { index: false, maxAge: production ? "1h" : 0 }));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(distPath, "index.html"), (error) => {
    if (error) next(error);
  });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = Number.isInteger(error.status) ? error.status : 500;
  if (status >= 500) console.error("Request failed:", error);
  res.status(status).json({ error: status === 500 ? "Terjadi kesalahan pada server." : error.message });
});

const server = app.listen(port, () => console.log(`Rekap Baris listening on port ${port}`));

async function shutdown(signal) {
  console.log(`${signal} received; shutting down.`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
