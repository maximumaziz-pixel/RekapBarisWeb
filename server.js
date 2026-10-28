require("dotenv").config();

const crypto = require("node:crypto");
const path = require("node:path");
const fs = require("node:fs/promises");
const express = require("express");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const midtransClient = require("midtrans-client");
const { OAuth2Client } = require("google-auth-library");
const { PrismaClient } = require("@prisma/client");
const { z } = require("zod");
const { loginAttemptKey } = require("./auth-rate-limit");
const { classifyNotification, verifyNotificationSignature } = require("./midtrans-notification");
const { hashPassword, isStrongPassword, verifyPassword } = require("./auth-password");
const { normalizePhone, phoneLookupCandidates, whatsappRecipient } = require("./phone");
const { getFonnteConfig, sendPasswordResetWhatsApp } = require("./whatsapp");
const { scoringHistoryForParticipant, scoringSummary } = require("./scoring");

const app = express();
const prisma = new PrismaClient();
const port = Number(process.env.PORT || 3000);
const uploadPath = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, "uploads"));
const production = process.env.NODE_ENV === "production";
const cookieName = "rb_session";
const oauthCookieName = "rb_google_oauth";
const jwtSecret = process.env.JWT_SECRET || "";
const googleClientId = process.env.GOOGLE_CLIENT_ID || "";
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
const appUrl = process.env.APP_URL || `http://localhost:${port}`;
const googleCallbackUrl = process.env.GOOGLE_CALLBACK_URL || new URL("/api/auth/google/callback", appUrl).toString();
const googleAuth = new OAuth2Client(googleClientId, googleClientSecret, googleCallbackUrl);

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

const registrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Terlalu banyak permintaan pendaftaran. Silakan coba lagi beberapa saat." }
});
const passwordResetRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Permintaan reset terlalu sering. Silakan coba lagi beberapa saat." }
});
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Terlalu banyak percobaan reset password. Silakan coba lagi beberapa saat." }
});
const googleAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Terlalu banyak permintaan Google OAuth. Silakan coba lagi beberapa saat." }
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

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || null,
    institution: user.institution || null,
    eventName: user.eventName || null,
    role: user.role,
    status: user.status
  };
}

function signIn(res, user) {
  const token = jwt.sign({ sub: user.id, ver: user.authVersion }, jwtSecret, { expiresIn: "7d", issuer: "rekapbaris.com" });
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
    if (!user || user.status !== "ACTIVE" || payload.ver !== user.authVersion) {
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

const passwordSchema = z.string().refine(isStrongPassword, {
  message: "Password minimal 8 karakter dan harus mengandung huruf, angka, serta simbol."
});

async function requireMidtrans() {
  if (!process.env.MIDTRANS_SERVER_KEY || !process.env.MIDTRANS_CLIENT_KEY) {
    throw apiError(503, "Pembayaran belum dikonfigurasi. Silakan hubungi penyelenggara.");
  }
}

const eventSchema = z.object({
  name: z.string().trim().min(3).max(150),
  institution: z.string().trim().min(2).max(120),
  description: z.string().trim().max(3000).optional(),
  posterUrl: z.string().trim().url().max(1000).refine((value) => value.startsWith("https://"), "Poster harus menggunakan HTTPS.").optional().or(z.literal("")),
  startsAt: z.string().datetime().optional().or(z.literal("")),
  endsAt: z.string().datetime().optional().or(z.literal("")),
  schedules: z.array(z.object({ startsAt: z.string().datetime(), endsAt: z.string().datetime().optional().or(z.literal("")) }).refine((schedule) => !schedule.endsAt || new Date(schedule.endsAt) > new Date(schedule.startsAt), { message: "Waktu selesai jadwal harus setelah waktu mulai." })).max(20).optional(),
  location: z.string().trim().max(200).optional(),
  ticketPrice: z.number().int().min(0).max(100000000).default(0),
  votePrice: z.number().int().min(1000).max(10000000).default(1000)
}).refine((event) => !event.startsAt || !event.endsAt || new Date(event.endsAt) > new Date(event.startsAt), {
  message: "Waktu selesai event harus setelah waktu mulai."
}).refine((event) => !event.schedules || new Set(event.schedules.map((schedule) => schedule.startsAt)).size === event.schedules.length, {
  message: "Tanggal pelaksanaan tidak boleh duplikat."
});
const loginIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Terlalu banyak percobaan login dari jaringan ini. Silakan coba lagi beberapa saat." }
});
const loginAttemptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  keyGenerator: loginAttemptKey,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Terlalu banyak percobaan gagal untuk akun ini. Silakan coba lagi beberapa saat." }
});

app.get("/api/health", asyncRoute(async (req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ ok: true, service: "rekapbaris-api" });
}));

function authRedirect(result) {
  const target = new URL("/", appUrl);
  target.searchParams.set("auth", result);
  return target.toString();
}

const passwordAccountSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: passwordSchema,
  role: z.enum(["PARTICIPANT", "ORGANIZER"]).default("PARTICIPANT"),
  phone: z.string().trim().min(8).max(30).refine((value) => Boolean(normalizePhone(value)), "Masukkan nomor HP yang valid."),
  institution: z.string().trim().max(120).optional(),
  eventName: z.string().trim().max(150).optional()
}).refine((input) => Boolean(input.institution), {
  message: "Peserta dan penyelenggara harus mengisi asal satuan."
}).refine((input) => input.role !== "ORGANIZER" || input.eventName, {
  message: "Penyelenggara harus mengisi nama event."
});

app.post("/api/auth/register", registrationLimiter, asyncRoute(async (req, res) => {
  const input = parse(passwordAccountSchema, req.body);
  const existing = await prisma.user.findFirst({ where: { email: input.email, role: input.role } });
  if (existing) throw apiError(409, "Email sudah terdaftar untuk jenis akun ini. Silakan masuk atau gunakan Google.");

  try {
    const passwordHash = await hashPassword(input.password);
    const created = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          phone: normalizePhone(input.phone),
          passwordHash,
          role: input.role,
          // Participant self-signups can continue straight into event registration; organizer accounts still require review.
          status: input.role === "PARTICIPANT" ? "ACTIVE" : "PENDING",
          institution: input.institution,
          eventName: input.role === "ORGANIZER" ? input.eventName : undefined
        }
      });
      if (created.role === "ORGANIZER") {
        await tx.event.create({
          data: {
            organizerId: created.id,
            name: input.eventName,
            institution: input.institution
          }
        });
      }
      return created;
    });
    if (created.status === "ACTIVE") {
      signIn(res, created);
      return res.status(201).json({
        status: "active",
        user: publicUser(created),
        message: "Akun peserta berhasil dibuat. Anda sudah masuk."
      });
    }
    res.status(201).json({ status: "pending", message: "Akun penyelenggara menunggu persetujuan Admin/Tim Rekap." });
  } catch (error) {
    if (error.code === "P2002") {
      const target = error.meta?.target;
      throw apiError(409, Array.isArray(target) && target.includes("phone")
        ? "Nomor telepon sudah digunakan oleh akun lain."
        : "Email sudah terdaftar untuk jenis akun ini. Silakan masuk atau gunakan Google.");
    }
    throw error;
  }
}));

app.post("/api/auth/login", loginIpLimiter, loginAttemptLimiter, asyncRoute(async (req, res) => {
  const input = parse(z.object({
    identifier: z.string().trim().min(1).max(254),
    password: z.string().min(1).max(128),
    role: z.enum(["PARTICIPANT", "ORGANIZER"]).optional()
  }), req.body);

  const identifier = input.identifier.toLowerCase();
  let user;
  if (identifier.includes("@")) {
    user = input.role
      ? await prisma.user.findUnique({ where: { email_role: { email: identifier, role: input.role } } })
      : await prisma.user.findFirst({ where: { email: identifier, role: { in: ["PARTICIPANT", "ORGANIZER"] } }, orderBy: { createdAt: "asc" } });
    if (!user) {
      const staffAccount = [
        { email: process.env.ADMIN_EMAIL, role: "ADMIN" },
        { email: process.env.TEAM_EMAIL, role: "TEAM" }
      ].find((account) => account.email && account.email.toLowerCase() === identifier);
      if (staffAccount) user = await prisma.user.findFirst({ where: { email: identifier, role: staffAccount.role } });
    }
  } else {
    const phone = normalizePhone(input.identifier);
    if (phone) {
      user = await prisma.user.findFirst({ where: { phone: { in: phoneLookupCandidates(input.identifier) } } });
    }
    if (!user) {
      const staffAccount = [
        { name: process.env.ADMIN_NAME, email: process.env.ADMIN_EMAIL, role: "ADMIN" },
        { name: process.env.TEAM_NAME, email: process.env.TEAM_EMAIL, role: "TEAM" }
      ].find((account) => account.name && account.email && account.name.trim().toLowerCase() === identifier);
      if (staffAccount) {
        user = await prisma.user.findFirst({
          where: { email: staffAccount.email.toLowerCase(), role: staffAccount.role }
        });
      }
    }
  }
  let passwordMatches = false;
  if (user?.passwordHash) passwordMatches = await verifyPassword(input.password, user.passwordHash);
  else await hashPassword(input.password);
  if (!user?.passwordHash || !passwordMatches) {
    throw apiError(401, "Email atau password salah.");
  }
  if (user.status !== "ACTIVE") {
    throw apiError(403, user.status === "REJECTED"
      ? "Akun ini tidak dapat digunakan. Hubungi administrator."
      : "Akun Anda masih menunggu persetujuan tim Rekap Baris.");
  }
  signIn(res, user);
  res.json({ user: publicUser(user) });
}));

const genericResetMessage = "Jika nomor tersebut terdaftar, tautan reset password akan dikirim melalui WhatsApp.";

app.post("/api/auth/forgot-password", passwordResetRequestLimiter, asyncRoute(async (req, res) => {
  const input = parse(z.object({
    phone: z.string().trim().min(8).max(30)
      .refine((phone) => Boolean(normalizePhone(phone)), "Masukkan nomor HP yang valid.")
      .transform(normalizePhone)
  }), req.body);
  if (!getFonnteConfig()) throw apiError(503, "Layanan WhatsApp reset password belum dikonfigurasi. Hubungi administrator.");
  const user = await prisma.user.findFirst({ where: { phone: { in: phoneLookupCandidates(input.phone) } } });
  if (user) {
    const token = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordResetTokenHash: tokenHash, passwordResetExpiresAt: expiresAt }
    });
    try {
      const recipient = whatsappRecipient(user.phone);
      if (!recipient) throw new Error("Account phone number is not a valid WhatsApp recipient.");
      const resetUrl = new URL("/", appUrl);
      resetUrl.searchParams.set("resetToken", token);
      await sendPasswordResetWhatsApp({ phone: recipient, name: user.name, resetUrl: resetUrl.toString() });
    } catch (error) {
      try {
        await prisma.user.updateMany({
          where: { id: user.id, passwordResetTokenHash: tokenHash },
          data: { passwordResetTokenHash: null, passwordResetExpiresAt: null }
        });
      } catch (cleanupError) {
        console.error("Failed to clear undelivered password reset token:", cleanupError.message);
      }
      console.error("Password reset WhatsApp delivery failed:", error.message);
    }
  }
  res.json({ message: genericResetMessage });
}));

app.post("/api/auth/reset-password", passwordResetLimiter, asyncRoute(async (req, res) => {
  const input = parse(z.object({
    token: z.string().min(32).max(128),
    password: passwordSchema
  }), req.body);
  const tokenHash = crypto.createHash("sha256").update(input.token).digest("hex");
  const user = await prisma.user.findFirst({
    where: { passwordResetTokenHash: tokenHash, passwordResetExpiresAt: { gt: new Date() } }
  });
  if (!user) throw apiError(400, "Tautan reset tidak valid atau sudah kedaluwarsa.");
  const passwordHash = await hashPassword(input.password);
  const updated = await prisma.user.updateMany({
    where: {
      id: user.id,
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: { gt: new Date() }
    },
    data: {
      passwordHash,
      authVersion: { increment: 1 },
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null
    }
  });
  if (updated.count !== 1) throw apiError(400, "Tautan reset tidak valid atau sudah kedaluwarsa.");
  res.json({ message: "Password berhasil diperbarui. Silakan masuk." });
}));

app.get("/api/auth/google", googleAuthLimiter, asyncRoute(async (req, res) => {
  if (!googleClientId || !googleClientSecret) throw apiError(503, "Login Google belum dikonfigurasi.");
  const input = parse(z.object({
    role: z.enum(["PARTICIPANT", "ORGANIZER"]).default("PARTICIPANT"),
    institution: z.string().trim().max(120).optional(),
    eventName: z.string().trim().max(150).optional()
  }), req.query);
  if (input.role === "ORGANIZER" && (!input.institution || !input.eventName)) {
    throw apiError(400, "Penyelenggara harus mengisi asal satuan dan nama event.");
  }

  const state = crypto.randomBytes(32).toString("hex");
  const codeVerifier = crypto.randomBytes(48).toString("base64url");
  const signedState = jwt.sign({
    state,
    codeVerifier,
    role: input.role,
    institution: input.institution,
    eventName: input.eventName
  }, jwtSecret, { expiresIn: "10m", issuer: "rekapbaris.com" });
  res.cookie(oauthCookieName, signedState, {
    httpOnly: true,
    secure: production || process.env.COOKIE_SECURE === "true",
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: 10 * 60 * 1000
  });
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  const authorizationUrl = googleAuth.generateAuthUrl({
    access_type: "online",
    prompt: "select_account",
    scope: ["openid", "email", "profile"],
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256"
  });
  res.redirect(authorizationUrl);
}));

app.get("/api/auth/google/callback", googleAuthLimiter, asyncRoute(async (req, res) => {
  const clearOauthCookie = () => res.clearCookie(oauthCookieName, {
    httpOnly: true,
    secure: production || process.env.COOKIE_SECURE === "true",
    sameSite: "lax",
    path: "/api/auth/google"
  });
  if (req.query.error) {
    clearOauthCookie();
    return res.redirect(authRedirect("cancelled"));
  }
  const code = z.string().min(1).safeParse(req.query.code);
  const state = z.string().min(1).safeParse(req.query.state);
  let oauthState;
  try {
    oauthState = jwt.verify(req.cookies[oauthCookieName] || "", jwtSecret, {
      issuer: "rekapbaris.com",
      algorithms: ["HS256"]
    });
  } catch {
    clearOauthCookie();
    return res.redirect(authRedirect("google_error"));
  }
  clearOauthCookie();
  if (!code.success || !state.success || typeof oauthState !== "object" ||
      typeof oauthState.state !== "string" ||
      Buffer.byteLength(state.data) !== Buffer.byteLength(oauthState.state) ||
      !crypto.timingSafeEqual(Buffer.from(state.data), Buffer.from(oauthState.state))) {
    return res.redirect(authRedirect("google_error"));
  }

  try {
    const { tokens } = await googleAuth.getToken({
      code: code.data,
      codeVerifier: oauthState.codeVerifier,
      redirect_uri: googleCallbackUrl
    });
    if (!tokens.id_token) throw new Error("Google did not return an ID token.");
    const ticket = await googleAuth.verifyIdToken({ idToken: tokens.id_token, audience: googleClientId });
    const profile = ticket.getPayload();
    if (!profile?.sub || !profile.email || profile.email_verified !== true) {
      throw apiError(401, "Google account email must be verified.");
    }

    const user = await prisma.$transaction(async (tx) => {
      let existing = await tx.user.findUnique({ where: { googleId: profile.sub } });
      if (!existing) existing = await tx.user.findFirst({ where: { email: profile.email.toLowerCase(), role: "PARTICIPANT" } });
      if (!existing) {
        return tx.user.create({
          data: {
            name: profile.name?.trim() || profile.email.split("@")[0],
            email: profile.email.toLowerCase(),
            googleId: profile.sub,
            role: "PARTICIPANT",
            status: "ACTIVE"
          }
        });
      }
      if (existing?.googleId && existing.googleId !== profile.sub) {
        throw apiError(409, "Email ini sudah terhubung ke akun Google lain.");
      }
      return tx.user.update({
        where: { id: existing.id },
        data: { googleId: profile.sub, name: profile.name || existing.name }
      });
    });

    if (user.status !== "ACTIVE") {
      return res.redirect(authRedirect(user.status === "REJECTED" ? "blocked" : "pending"));
    }
    signIn(res, user);
    return res.redirect(authRedirect("success"));
  } catch (error) {
    console.error("Google OAuth failed:", error.message);
    const result = error.status === 409 ? "account_conflict" : "google_error";
    return res.redirect(authRedirect(result));
  }
}));

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie(cookieName, { httpOnly: true, secure: production || process.env.COOKIE_SECURE === "true", sameSite: "lax", path: "/" });
  res.status(204).end();
});

app.get("/api/auth/me", requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

app.get("/api/dashboard", requireAuth, asyncRoute(async (req, res) => {
  const { id, role, institution, eventName } = req.user;
  if (role === "PARTICIPANT") {
    const [registrations, payments] = await Promise.all([
      prisma.eventRegistration.findMany({
        where: { userId: id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          eventId: true,
          participantName: true,
          teamName: true,
          status: true,
          scoringTierId: true,
          createdAt: true,
          event: { select: {
            name: true,
            institution: true,
            posterUrl: true,
            startsAt: true,
            scoringConfiguration: true,
            scoringFormat: { select: { configuration: true } }
          } }
        }
      }),
      prisma.payment.findMany({
        where: { userId: id },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          event: { select: { name: true } },
          product: { select: { name: true } },
          schedule: { select: { startsAt: true, endsAt: true } },
          tickets: { select: { id: true, code: true, status: true, schedule: { select: { startsAt: true } } } }
        }
      })
    ]);
    const assessmentByRegistration = new Map();
    const scoringRegistrations = registrations.filter((registration) => registration.status === "APPROVED");
    const scoringScopes = [...new Map(scoringRegistrations.map((registration) => [
      `${registration.eventId}:${registration.scoringTierId || ""}`,
      registration
    ])).values()];
    await Promise.all(scoringScopes.map(async (registration) => {
      try {
        const scoringEvent = await getScoringEvent(registration.eventId, registration.scoringTierId || undefined);
        const summary = scoringSummary(scoringEvent);
        for (const scopedRegistration of scoringRegistrations.filter((item) =>
          item.eventId === registration.eventId
          && (item.scoringTierId || scoringEvent.scoringTiers[0].id) === scoringEvent.activeTier.id)) {
          assessmentByRegistration.set(scopedRegistration.id, scoringHistoryForParticipant(
            summary,
            scopedRegistration.id,
            scoringEvent.scoringConfiguration,
            scoringEvent.activeTier
          ));
        }
      } catch (error) {
        console.error("Participant assessment history could not be loaded:", {
          eventId: registration.eventId,
          registrationId: registration.id,
          message: error.message
        });
        for (const scopedRegistration of scoringRegistrations.filter((item) =>
          item.eventId === registration.eventId && item.scoringTierId === registration.scoringTierId)) {
          assessmentByRegistration.set(scopedRegistration.id, {
            error: "Riwayat nilai belum dapat dimuat. Silakan coba lagi atau hubungi penyelenggara."
          });
        }
      }
    }));
    const adminContactPhone = process.env.ADMIN_PHONE || process.env.TEAM_PHONE || "";
    const participantRegistrations = registrations.map((registration) => {
      const { scoringConfiguration, scoringFormat, ...event } = registration.event;
      const settings = (scoringConfiguration || scoringFormat?.configuration)?.settings;
      const announcement = settings?.announcement;
      return {
        ...registration,
        assessment: assessmentByRegistration.get(registration.id) || null,
        event: {
          ...event,
          announcement: announcement?.enabled && (announcement.title || announcement.message)
            ? { title: announcement.title || "Pengumuman lomba", message: announcement.message || "" }
            : null
        }
      };
    });
    return res.json({ role, institution, registrations: participantRegistrations, payments: payments.map((payment) => ({
      ...payment,
      ...(payment.type === "MERCH" && payment.status === "SETTLED" && adminContactPhone ? { adminContactPhone } : {})
    })) });
  }
  if (role === "ORGANIZER") {
    const events = await prisma.event.findMany({
      where: { organizerId: id },
      orderBy: { createdAt: "desc" },
      include: { schedules: { orderBy: { startsAt: "asc" } }, _count: { select: { registrations: true } } }
    });
    return res.json({ role, institution, events });
  }
  throw apiError(403, "Role tidak memiliki dashboard pengguna.");
}));

app.get("/api/events", publicLimiter, asyncRoute(async (req, res) => {
  const events = await prisma.event.findMany({
    where: { status: "APPROVED" },
    orderBy: [{ startsAt: "asc" }, { createdAt: "desc" }],
    include: { schedules: { orderBy: { startsAt: "asc" } }, _count: { select: { registrations: { where: { status: "APPROVED" } } } } }
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
    schedules: event.schedules,
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
    include: { schedules: { orderBy: { startsAt: "asc" } }, registrations: { where: { status: "APPROVED" }, orderBy: { participantName: "asc" } } }
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
    schedules: event.schedules,
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
  const { schedules = [], ...fields } = input;
  const dates = schedules.length ? schedules : input.startsAt ? [{ startsAt: input.startsAt, endsAt: input.endsAt || "" }] : [];
  const orderedDates = dates.map((date) => ({ ...date, start: new Date(date.startsAt), end: date.endsAt ? new Date(date.endsAt) : null })).sort((a, b) => a.start - b.start);
  const event = await prisma.$transaction(async (tx) => {
    const created = await tx.event.create({ data: {
      ...fields,
      startsAt: orderedDates[0]?.start || (input.startsAt ? new Date(input.startsAt) : null),
      endsAt: orderedDates.at(-1)?.end || (input.endsAt ? new Date(input.endsAt) : null),
      organizerId: req.user.id,
      status: req.user.role === "ADMIN" ? "APPROVED" : "PENDING"
    } });
    if (orderedDates.length) await tx.eventSchedule.createMany({ data: orderedDates.map((date) => ({ eventId: created.id, startsAt: date.start, endsAt: date.end })) });
    return created;
  });
  res.status(201).json({ event });
}));

app.patch("/api/events/:id", requireAuth, asyncRoute(async (req, res) => {
  if (!["ORGANIZER", "ADMIN", "TEAM"].includes(req.user.role)) throw apiError(403, "Hanya penyelenggara atau staf yang dapat mengubah event.");
  const input = parse(eventSchema.partial(), req.body);
  const existing = await prisma.event.findUnique({ where: { id: req.params.id }, select: { id: true, organizerId: true } });
  if (!existing || (req.user.role === "ORGANIZER" && existing.organizerId !== req.user.id)) throw apiError(404, "Event tidak ditemukan atau bukan milik akun Anda.");
  const { schedules, ...fields } = input;
  if (fields.startsAt && fields.endsAt && new Date(fields.endsAt) <= new Date(fields.startsAt)) throw apiError(400, "Waktu selesai event harus setelah waktu mulai.");
  const updateData = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, ["startsAt", "endsAt"].includes(key) ? value ? new Date(value) : null : value]));
  const event = await prisma.$transaction(async (tx) => {
    if (schedules) {
      await tx.eventSchedule.deleteMany({ where: { eventId: existing.id } });
      const orderedDates = schedules.map((date) => ({ ...date, start: new Date(date.startsAt), end: date.endsAt ? new Date(date.endsAt) : null })).sort((a, b) => a.start - b.start);
      if (orderedDates.length) await tx.eventSchedule.createMany({ data: orderedDates.map((date) => ({ eventId: existing.id, startsAt: date.start, endsAt: date.end })) });
      updateData.startsAt = orderedDates[0]?.start || null;
      updateData.endsAt = orderedDates.at(-1)?.end || null;
    }
    return tx.event.update({ where: { id: existing.id }, data: updateData, include: { schedules: { orderBy: { startsAt: "asc" } } } });
  });
  res.json({ event });
}));

const posterMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const validatePosterMime = (req, res, next) => {
  const mime = req.headers["content-type"]?.split(";")[0].trim().toLowerCase();
  if (!posterMimeTypes.has(mime)) return next(apiError(415, "File harus berupa JPEG, PNG, atau WebP."));
  next();
};
const posterUpload = express.raw({ type: () => true, limit: "5mb" });
app.put("/api/events/:id/poster", requireAuth, validatePosterMime, posterUpload, asyncRoute(async (req, res) => {
  if (!["ORGANIZER", "ADMIN", "TEAM"].includes(req.user.role)) throw apiError(403, "Hanya penyelenggara atau staf yang dapat mengubah poster event.");
  const event = await prisma.event.findUnique({ where: { id: req.params.id }, select: { id: true, organizerId: true } });
  if (!event || (req.user.role === "ORGANIZER" && event.organizerId !== req.user.id)) throw apiError(404, "Event tidak ditemukan atau bukan milik akun Anda.");
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw apiError(400, "Pilih file poster sebelum mengunggah.");
  const mime = req.headers["content-type"]?.split(";")[0].toLowerCase();
  const signatures = {
    "image/png": req.body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    "image/jpeg": req.body[0] === 0xff && req.body[1] === 0xd8 && req.body[2] === 0xff,
    "image/webp": req.body.toString("ascii", 0, 4) === "RIFF" && req.body.toString("ascii", 8, 12) === "WEBP"
  };
  if (!signatures[mime]) throw apiError(415, "File harus berupa gambar JPEG, PNG, atau WebP yang valid.");
  const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[mime];
  const filename = `${crypto.randomUUID()}.${extension}`;
  await fs.mkdir(uploadPath, { recursive: true });
  await fs.writeFile(path.join(uploadPath, filename), req.body, { flag: "wx", mode: 0o640 });
  const posterUrl = `/uploads/${filename}`;
  let updated;
  try {
    updated = await prisma.event.update({ where: { id: event.id }, data: { posterUrl } });
  } catch (error) {
    await fs.unlink(path.join(uploadPath, filename)).catch(() => {});
    throw error;
  }
  res.json({ posterUrl: updated.posterUrl });
}));

app.post("/api/admin/products/image", requireAuth, requireStaff, validatePosterMime, posterUpload, asyncRoute(async (req, res) => {
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw apiError(400, "Pilih foto produk sebelum mengunggah.");
  const mime = req.headers["content-type"]?.split(";")[0].toLowerCase();
  const valid = mime === "image/png" ? req.body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : mime === "image/jpeg" ? req.body[0] === 0xff && req.body[1] === 0xd8 && req.body[2] === 0xff
    : req.body.toString("ascii", 0, 4) === "RIFF" && req.body.toString("ascii", 8, 12) === "WEBP";
  if (!valid) throw apiError(415, "File harus berupa gambar JPEG, PNG, atau WebP yang valid.");
  const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[mime];
  const filename = `${crypto.randomUUID()}.${extension}`;
  await fs.mkdir(uploadPath, { recursive: true });
  await fs.writeFile(path.join(uploadPath, filename), req.body, { flag: "wx", mode: 0o640 });
  res.status(201).json({ imageUrl: `/uploads/${filename}` });
}));

app.post("/api/events/:id/register", requireAuth, asyncRoute(async (req, res) => {
  if (req.user.role !== "PARTICIPANT") {
    throw apiError(403, "Hanya akun peserta yang dapat mendaftar pada event.");
  }
  const input = parse(z.object({
    participantName: z.string().trim().min(2).max(100),
    teamName: z.string().trim().max(120).optional()
  }), req.body);
  const event = await prisma.event.findFirst({ where: { id: req.params.id, status: "APPROVED" }, select: { id: true } });
  if (!event) throw apiError(404, "Event tidak ditemukan atau belum tersedia.");
  const existingRegistration = await prisma.eventRegistration.findUnique({
    where: { eventId_userId: { eventId: event.id, userId: req.user.id } },
    select: { id: true }
  });
  if (existingRegistration) throw apiError(409, "Akun Anda sudah terdaftar pada event ini.");
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
    if (error.code === "P2002") {
      const target = error.meta?.target;
      if (Array.isArray(target) && target.includes("userId")) throw apiError(409, "Akun Anda sudah terdaftar pada event ini.");
      throw apiError(409, "Nama peserta tersebut sudah terdaftar pada event ini.");
    }
    throw error;
  }
}));

app.get("/api/merch", publicLimiter, asyncRoute(async (req, res) => {
  const products = await prisma.product.findMany({
    where: { active: true },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, description: true, imageUrl: true, price: true, stock: true, variants: { select: { id: true, size: true, stock: true }, orderBy: { size: "asc" } } }
  });
  res.json({ products });
}));

async function createPayment(req, res, type) {
  await requireMidtrans();
  const input = parse(z.object({
    quantity: z.number().int().min(1).max(10).default(1),
    eventId: z.string().optional(),
    scheduleId: z.string().optional(),
    registrationId: z.string().optional(),
    productId: z.string().optional(),
    variantId: z.string().optional(),
    buyerName: z.string().trim().min(2).max(120).optional(),
    buyerPhone: z.string().trim().min(8).max(30).refine((value) => Boolean(normalizePhone(value)), "Masukkan nomor HP pembeli yang valid.").transform((value) => normalizePhone(value)).optional()
  }), req.body);
  let event = null;
  let schedule = null;
  let product = null;
  let variant = null;
  let unitPrice = 0;
  let buyerName = input.buyerName || req.user.name;
  let buyerPhone = input.buyerPhone || req.user.phone || "";
  if (type === "TICKET" || type === "VOTE") {
    if (!input.eventId) throw apiError(400, "Event wajib dipilih.");
    event = await prisma.event.findFirst({ where: { id: input.eventId, status: "APPROVED" } });
    if (!event) throw apiError(404, "Event tidak ditemukan atau belum tersedia.");
    if (type === "TICKET") {
      if (!input.scheduleId) throw apiError(400, "Tanggal pelaksanaan tiket wajib dipilih.");
      schedule = await prisma.eventSchedule.findFirst({ where: { id: input.scheduleId, eventId: event.id } });
      if (!schedule) throw apiError(400, "Tanggal tiket tidak tersedia untuk event ini.");
      if (!input.buyerPhone && !req.user.phone) throw apiError(400, "Nomor HP pembeli wajib diisi.");
      unitPrice = event.ticketPrice;
    }
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
    if (input.variantId) {
      variant = await prisma.productVariant.findFirst({ where: { id: input.variantId, productId: product.id } });
      if (!variant) throw apiError(400, "Ukuran produk tidak tersedia.");
    } else if (await prisma.productVariant.count({ where: { productId: product.id } })) {
      throw apiError(400, "Pilih ukuran produk sebelum melanjutkan.");
    }
    unitPrice = product.price;
  }
  if (unitPrice < 1) throw apiError(400, "Harga belum tersedia untuk transaksi ini.");
  const amount = unitPrice * input.quantity;
  const orderId = `rb_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
  let payment;
  try {
    payment = await prisma.$transaction(async (tx) => {
      if (product) {
        let stock;
        if (variant) {
          stock = await tx.productVariant.updateMany({ where: { id: variant.id, stock: { gte: input.quantity } }, data: { stock: { decrement: input.quantity } } });
          if (stock.count === 1) {
            const aggregateStock = await tx.product.updateMany({ where: { id: product.id, active: true, stock: { gte: input.quantity } }, data: { stock: { decrement: input.quantity } } });
            if (aggregateStock.count !== 1) throw apiError(409, "Stok agregat produk tidak konsisten. Periksa inventaris produk.");
          }
        } else {
          stock = await tx.product.updateMany({ where: { id: product.id, active: true, stock: { gte: input.quantity } }, data: { stock: { decrement: input.quantity } } });
        }
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
          productId: product?.id,
          variantId: variant?.id,
          scheduleId: schedule?.id,
          buyerName: type === "TICKET" ? buyerName : undefined,
          buyerPhone: type === "TICKET" ? buyerPhone : undefined,
          unitPrice,
          itemName: type === "MERCH" ? `${product.name}${variant ? ` (${variant.size})` : ""}` : `${type === "VOTE" ? "Vote" : "Tiket"} ${event?.name || ""}`.trim().slice(0, 120)
        }
      });
    });
  } catch (error) {
    throw error;
  }
  try {
    const transaction = await midtrans.createTransaction({
      transaction_details: { order_id: orderId, gross_amount: amount },
      callbacks: { finish: new URL(`/?paymentId=${encodeURIComponent(payment.id)}`, appUrl).toString() },
      customer_details: {
        first_name: type === "TICKET" ? buyerName : req.user.name,
        email: req.user.email,
        ...((type === "TICKET" ? buyerPhone : req.user.phone) ? { phone: type === "TICKET" ? buyerPhone : req.user.phone } : {})
      },
      item_details: [{
        id: type === "MERCH" ? (variant?.id || product.id) : (event?.id || type.toLowerCase()),
        price: unitPrice,
        quantity: input.quantity,
        name: type === "MERCH" ? `${product.name}${variant ? ` ${variant.size}` : ""}`.slice(0, 50) : `${type === "VOTE" ? "Vote" : `Tiket ${schedule?.startsAt.toLocaleDateString("id-ID")}`} ${event.name}`.slice(0, 50)
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
      if (variant) {
        await tx.productVariant.update({ where: { id: variant.id }, data: { stock: { increment: input.quantity } } });
        await tx.product.update({ where: { id: product.id }, data: { stock: { increment: input.quantity } } });
      }
      else if (product) await tx.product.update({ where: { id: product.id }, data: { stock: { increment: input.quantity } } });
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
    include: { tickets: { select: { code: true, status: true, schedule: { select: { startsAt: true } } } } }
  });
  if (!payment) throw apiError(404, "Transaksi tidak ditemukan.");
  const adminContactPhone = process.env.ADMIN_PHONE || process.env.TEAM_PHONE || "";
  res.json({
    payment: {
      ...payment,
      ...(payment.type === "MERCH" && payment.status === "SETTLED" && adminContactPhone ? { adminContactPhone } : {})
    }
  });
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
  if (!verifyNotificationSignature({
    orderId: body.order_id,
    statusCode: body.status_code,
    grossAmount: body.gross_amount,
    signatureKey: body.signature_key,
    serverKey
  })) {
    throw apiError(403, "Signature webhook tidak valid.");
  }
  const notification = classifyNotification(body.transaction_status, body.fraud_status);
  if (!notification.settled && !notification.failed) return res.json({ ok: true });
  const { settled, failed, status: nextStatus } = notification;
  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { orderId: body.order_id } });
    if (!payment || payment.status !== "PENDING") return;
    const amount = Number(body.gross_amount);
    if (!Number.isSafeInteger(amount) || amount !== payment.amount) {
      throw apiError(400, "Nilai pembayaran tidak sesuai dengan transaksi.");
    }
    const claimed = await tx.payment.updateMany({
      where: { id: payment.id, status: "PENDING" },
      data: {
        status: nextStatus,
        settledAt: settled ? new Date() : null,
        midtransTransactionId: body.transaction_id
      }
    });
    if (claimed.count !== 1) return;
    if (settled && payment.type === "TICKET") {
      if (payment.eventId && payment.scheduleId && payment.buyerName && payment.buyerPhone) {
        await tx.ticket.createMany({
          data: Array.from({ length: payment.quantity }, () => ({
          code: `RB-${crypto.randomBytes(8).toString("hex").toUpperCase()}`,
          paymentId: payment.id,
          eventId: payment.eventId,
          scheduleId: payment.scheduleId,
          buyerName: payment.buyerName,
          buyerPhone: payment.buyerPhone
          }))
        });
      }
    }
    if (failed && payment.productId) {
      if (payment.variantId) {
        await tx.productVariant.update({ where: { id: payment.variantId }, data: { stock: { increment: payment.quantity } } });
        await tx.product.update({ where: { id: payment.productId }, data: { stock: { increment: payment.quantity } } });
      }
      else await tx.product.update({
        where: { id: payment.productId },
        data: { stock: { increment: payment.quantity } }
      });
    }
  });
  res.json({ ok: true });
}));

app.get("/api/admin/summary", requireAuth, requireStaff, asyncRoute(async (req, res) => {
  const [users, pendingUsers, events, pendingEvents, payments] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: "PENDING" } }),
    prisma.event.count(),
    prisma.event.count({ where: { status: "PENDING" } }),
    prisma.payment.aggregate({ where: { status: "SETTLED" }, _sum: { amount: true }, _count: true })
  ]);
  res.json({ summary: { users, pendingUsers, events, pendingEvents, settledPayments: payments._count, revenue: payments._sum.amount || 0 } });
}));

async function getScoringEvent(eventId, requestedTierId) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      criteria: { orderBy: { createdAt: "asc" } },
      scoringFormat: { select: { configuration: true } },
      registrations: { where: { status: "APPROVED" }, orderBy: { participantName: "asc" }, include: { user: { select: { institution: true } } } },
      scores: true
    }
  });
  if (!event) throw apiError(404, "Event tidak ditemukan.");
  const savedConfiguration = event.scoringConfiguration || event.scoringFormat?.configuration || null;
  const configuredTiers = Array.isArray(savedConfiguration?.tiers) && savedConfiguration.tiers.length
    ? savedConfiguration.tiers
    : [{ id: "default", name: "Tingkat 1", formatId: event.scoringFormatId || null, configuration: savedConfiguration }];
  const activeTier = configuredTiers.find((tier) => tier.id === requestedTierId) || configuredTiers[0];
  if (!activeTier) throw apiError(409, "Event belum memiliki tingkatan penilaian.");
  const tierConfiguration = activeTier.configuration || savedConfiguration;
  const allRegistrations = event.registrations;
  const tierRegistrationIds = new Set(allRegistrations
    .filter((registration) => (registration.scoringTierId || configuredTiers[0].id) === activeTier.id)
    .map((registration) => registration.id));
  const tierCriteria = event.criteria.filter((criterion) => (criterion.tierId || configuredTiers[0].id) === activeTier.id);
  return {
    ...event,
    criteria: tierCriteria,
    registrations: event.registrations.filter((registration) => tierRegistrationIds.has(registration.id)),
    scores: event.scores.filter((score) => tierRegistrationIds.has(score.registrationId) && tierCriteria.some((criterion) => criterion.id === score.criterionId)),
    scoringConfiguration: tierConfiguration,
    scoringTiers: configuredTiers,
    activeTier,
    allRegistrations
  };
}

app.get("/api/admin/scoring/:eventId", requireAuth, requireStaff, asyncRoute(async (req, res) => {
  const event = await getScoringEvent(req.params.eventId, typeof req.query.tierId === "string" ? req.query.tierId : undefined);
  const summary = scoringSummary(event);
  res.json({
    event: { id: event.id, name: event.name },
    tiers: event.scoringTiers,
    activeTier: event.activeTier,
    participantAssignments: event.allRegistrations.map((registration) => ({
      registrationId: registration.id,
      participantName: registration.participantName,
      teamName: registration.teamName,
      tierId: registration.scoringTierId || event.scoringTiers[0].id
    })),
    criteria: event.criteria,
    configuration: event.scoringConfiguration,
    judges: event.scoringConfiguration?.judges || [],
    participants: summary.participants,
    masterParticipants: summary.masterParticipants,
    rankings: summary.rankings,
    settings: summary.settings,
    scoreEntries: event.scores.map(({ registrationId, criterionId, judgeLabel, value }) => ({ registrationId, criterionId, judgeLabel, value }))
  });
}));

app.post("/api/admin/scoring/:eventId/participants", requireAuth, requireStaff, asyncRoute(async (req, res) => {
  const input = parse(z.object({
    tierId: z.string().min(1).optional(),
    participants: z.array(z.object({
      participantName: z.string().trim().min(2).max(100),
      teamName: z.string().trim().max(120).optional()
    })).min(1).max(500)
  }), req.body);
  const event = await prisma.event.findUnique({ where: { id: req.params.eventId }, select: { id: true, scoringConfiguration: true } });
  if (!event) throw apiError(404, "Event tidak ditemukan.");
  const configuredTiers = Array.isArray(event.scoringConfiguration?.tiers) && event.scoringConfiguration.tiers.length
    ? event.scoringConfiguration.tiers
    : [{ id: "default", name: "Tingkat 1" }];
  const tierId = input.tierId || configuredTiers[0].id;
  if (!configuredTiers.some((tier) => tier.id === tierId)) throw apiError(400, "Tingkatan peserta tidak tersedia pada event ini.");
  const normalizedNames = input.participants.map(({ participantName }) => participantName.toLocaleLowerCase("id-ID"));
  if (new Set(normalizedNames).size !== normalizedNames.length) throw apiError(400, "Daftar peserta memuat nama atau nomor ganda.");
  const registrations = await prisma.$transaction(input.participants.map((participant) => prisma.eventRegistration.create({
    data: {
      eventId: event.id,
      scoringTierId: tierId,
      participantName: participant.participantName,
      teamName: participant.teamName || "",
      status: "APPROVED"
    }
  }))).catch((error) => {
    if (error.code === "P2002") throw apiError(409, "Nama peserta sudah terdaftar pada event ini.");
    throw error;
  });
  res.status(201).json({ participants: registrations });
}));

app.post("/api/admin/scoring/:eventId/upload", requireAuth, requireStaff, asyncRoute(async (req, res) => {
  const input = parse(z.object({
    scores: z.array(z.object({
      registrationId: z.string().min(1),
      criterionId: z.string().min(1),
      judgeLabel: z.string().trim().min(2).max(120),
      value: z.number().int().finite()
    })).max(5000),
    recaps: z.array(z.object({
      registrationId: z.string().min(1),
      penaltyQuantities: z.record(z.number().int().min(0).max(100000)),
      performanceTime: z.string().trim().max(5).regex(/^$|^\d{2}:[0-5]\d$/)
    })).max(500)
  }), req.body);
  const event = await getScoringEvent(req.params.eventId, typeof req.query.tierId === "string" ? req.query.tierId : undefined);
  const configuration = event.scoringConfiguration;
  const maxPerformanceTime = configuration?.settings?.maxPerformanceTime;
  const timeToSeconds = (value) => {
    const match = /^(\d{2}):([0-5]\d)$/.exec(value || "");
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };
  const maximumSeconds = timeToSeconds(maxPerformanceTime);
  const registrations = new Set(event.registrations.map((registration) => registration.id));
  const criteria = new Map(event.criteria.filter((criterion) => criterion.active).map((criterion) => [criterion.id, criterion]));
  const allowedJudges = new Map((configuration?.judges || []).map((judge) => [
    judge.label || judge.name,
    new Set(judge.categoryIds || [])
  ]));
  const scoreKeys = new Set();
  for (const score of input.scores) {
    const criterion = criteria.get(score.criterionId);
    if (!registrations.has(score.registrationId)) throw apiError(400, "Daftar nilai memuat peserta yang tidak aktif pada event ini.");
    if (!criterion) throw apiError(400, "Daftar nilai memuat kriteria yang tidak aktif pada event ini.");
    if (!allowedJudges.get(score.judgeLabel)?.has(criterion.categoryId)) throw apiError(400, "Daftar nilai memuat juri yang tidak ditugaskan pada kategori tersebut.");
    if (score.value < criterion.minScore || score.value > criterion.maxScore) {
      throw apiError(400, `Nilai harus berada pada rentang ${criterion.minScore} sampai ${criterion.maxScore}.`);
    }
    const key = `${score.registrationId}:${score.criterionId}:${score.judgeLabel}`;
    if (scoreKeys.has(key)) throw apiError(400, "Daftar nilai memuat entri ganda.");
    scoreKeys.add(key);
  }
  const penaltyIds = new Set((configuration?.penalties || []).map((penalty) => penalty.id));
  const recapIds = new Set();
  for (const recap of input.recaps) {
    if (!registrations.has(recap.registrationId)) throw apiError(400, "Daftar rekap memuat peserta yang tidak aktif pada event ini.");
    if (recapIds.has(recap.registrationId)) throw apiError(400, "Daftar rekap memuat peserta ganda.");
    if (Object.keys(recap.penaltyQuantities).some((id) => !penaltyIds.has(id))) throw apiError(400, "Daftar rekap memuat pinalti yang tidak tersedia.");
    const timeSeconds = timeToSeconds(recap.performanceTime);
    if (timeSeconds !== null && maximumSeconds !== null && timeSeconds > maximumSeconds) throw apiError(400, `Waktu tampil tidak boleh melebihi ${maxPerformanceTime}.`);
    recapIds.add(recap.registrationId);
  }
  const uploadOperations = [
    ...input.scores.map((score) => prisma.competitionScore.upsert({
        where: {
          registrationId_criterionId_judgeLabel: {
            registrationId: score.registrationId,
            criterionId: score.criterionId,
            judgeLabel: score.judgeLabel
          }
        },
        create: { eventId: event.id, ...score },
        update: { value: score.value }
      })),
    ...input.recaps.map((recap) => prisma.eventRegistration.update({
        where: { id: recap.registrationId },
        data: { scoringPenalties: recap.penaltyQuantities, scoringTime: recap.performanceTime }
      }))
  ];
  await prisma.$transaction(uploadOperations);
  res.json({ uploadedScores: input.scores.length, uploadedRecaps: input.recaps.length });
}));

const scoringSettingsSchema = z.object({
  maxPerformanceTime: z.string().regex(/^\d{2}:[0-5]\d$/).or(z.literal("")).optional(),
  tieBreakers: z.object({
    overall: z.object({
      type: z.enum(["time", "category", "group"]),
      categoryId: z.string().optional(),
      groupId: z.string().optional()
    }).nullable().optional(),
    categories: z.record(z.object({
      type: z.enum(["time", "category", "group"]),
      categoryId: z.string().optional(),
      groupId: z.string().optional()
    }).nullable()).optional()
  }).optional(),
  announcement: z.object({
    enabled: z.boolean(),
    title: z.string().max(120),
    message: z.string().max(2000)
  }).optional(),
  kejuaraanApproved: z.boolean().optional()
}).passthrough();

const scoringFormatConfigurationSchema = z.object({
  tiers: z.array(z.object({
    id: z.string().min(1),
    name: z.string().trim().min(1).max(80),
    formatId: z.string().nullable().optional(),
    configuration: z.unknown().optional()
  })).max(3).optional(),
  categories: z.array(z.object({
    id: z.string().min(1),
    name: z.string().trim().min(2).max(80),
    items: z.array(z.string().trim().min(1).max(120)),
    itemGroups: z.array(z.object({
      id: z.string().min(1),
      name: z.string().trim().min(1).max(80),
      items: z.array(z.string().trim().min(1).max(120))
    })).optional(),
    rankingGroup: z.enum(["pbb", "varfor", "danton", "kostum"]).optional(),
    maxTime: z.string().regex(/^\d{1,3}:[0-5]\d$/).optional(),
    timePenaltyPerSecond: z.number().min(0).max(100000).optional()
  })).min(1),
  judges: z.array(z.object({
    id: z.string().min(1),
    label: z.string().trim().min(2).max(120),
    categoryIds: z.array(z.string().min(1))
  })),
  penalties: z.array(z.object({
    id: z.string().min(1),
    name: z.string().trim().min(2).max(120),
    value: z.number().min(0).max(100000)
  })),
  settings: scoringSettingsSchema.optional()
});

function validateScoringFormatConfiguration(configuration) {
  const categoryNames = configuration.categories.map((category) => category.name.toLocaleLowerCase("id-ID"));
  if (new Set(categoryNames).size !== categoryNames.length) throw apiError(400, "Nama kategori tidak boleh berulang.");
  const categoryIds = new Set(configuration.categories.map((category) => category.id));
  if (categoryIds.size !== configuration.categories.length) throw apiError(400, "ID kategori tidak boleh berulang.");
  const labels = configuration.judges.map((judge) => judge.label.toLocaleLowerCase("id-ID"));
  if (new Set(labels).size !== labels.length) throw apiError(400, "Label juri tidak boleh berulang.");
  const judgeIds = configuration.judges.map((judge) => judge.id);
  if (new Set(judgeIds).size !== judgeIds.length) throw apiError(400, "ID juri tidak boleh berulang.");
  if (configuration.categories.some((category) => new Set(category.items.map((item) => item.toLocaleLowerCase("id-ID"))).size !== category.items.length)) {
    throw apiError(400, "Item penilaian tidak boleh berulang di dalam kategori yang sama.");
  }
  if (configuration.categories.some((category) => {
    if (!category.itemGroups) return false;
    const groupIds = category.itemGroups.map((group) => group.id);
    const groupNames = category.itemGroups.map((group) => group.name.toLocaleLowerCase("id-ID"));
    const groupedItems = category.itemGroups.flatMap((group) => group.items);
    return !category.itemGroups.length
      || new Set(groupIds).size !== groupIds.length
      || new Set(groupNames).size !== groupNames.length
      || groupedItems.length !== category.items.length
      || category.items.some((item) => groupedItems.filter((groupItem) => groupItem === item).length !== 1);
  })) {
    throw apiError(400, "Setiap item harus masuk tepat ke satu kelompok penilaian dengan nama kelompok unik.");
  }
  if (configuration.judges.some((judge) => new Set(judge.categoryIds).size !== judge.categoryIds.length
    || judge.categoryIds.some((categoryId) => !categoryIds.has(categoryId)))) {
    throw apiError(400, "Hak akses juri merujuk kategori yang tidak tersedia.");
  }
  const tieBreakers = configuration.settings?.tieBreakers;
  const validSelection = (selection) => {
    if (!selection || selection.type === "time") return true;
    const category = configuration.categories.find((item) => item.id === selection.categoryId);
    if (!category) return false;
    return selection.type !== "group" || category.itemGroups?.some((group) => group.id === selection.groupId);
  };
  if (!validSelection(tieBreakers?.overall)
    || Object.values(tieBreakers?.categories || {}).some((selection) => !validSelection(selection))) {
    throw apiError(400, "Nilai pembanding merujuk kategori atau bagian yang tidak tersedia.");
  }
}

app.get("/api/admin/scoring-formats", requireAuth, requireStaff, asyncRoute(async (req, res) => {
  const formats = await prisma.scoringFormat.findMany({ orderBy: { updatedAt: "desc" } });
  res.json({ formats });
}));

app.post("/api/admin/scoring-formats", requireAuth, requireStaff, asyncRoute(async (req, res) => {
  const input = parse(z.object({
    name: z.string().trim().min(2).max(100),
    configuration: scoringFormatConfigurationSchema
  }), req.body);
  validateScoringFormatConfiguration(input.configuration);
  const format = await prisma.scoringFormat.create({
    data: {
      name: input.name,
      configuration: input.configuration,
      createdById: req.user.id
    }
  });
  res.status(201).json({ format });
}));

app.put("/api/admin/scoring-formats/:formatId", requireAuth, requireStaff, asyncRoute(async (req, res) => {
  const input = parse(z.object({
    name: z.string().trim().min(2).max(100),
    configuration: scoringFormatConfigurationSchema
  }), req.body);
  validateScoringFormatConfiguration(input.configuration);
  const format = await prisma.scoringFormat.update({
    where: { id: req.params.formatId },
    data: { name: input.name, configuration: input.configuration }
  }).catch((error) => {
    if (error.code === "P2025") throw apiError(404, "Format penilaian tidak ditemukan.");
    throw error;
  });
  res.json({ format });
}));

app.delete("/api/admin/scoring-formats/:formatId", requireAuth, requireStaff, asyncRoute(async (req, res) => {
  const format = await prisma.scoringFormat.findUnique({ where: { id: req.params.formatId }, select: { id: true } });
  if (!format) throw apiError(404, "Format penilaian tidak ditemukan.");
  const linkedEvent = await prisma.event.findFirst({
    where: {
      OR: [
        { scoringFormatId: format.id },
        { scoringConfiguration: { path: ["tiers"], array_contains: [{ formatId: format.id }] } }
      ]
    },
    select: { id: true }
  });
  if (linkedEvent) throw apiError(409, "Format sedang digunakan oleh event. Lepaskan format dari tingkatan event terlebih dahulu.");
  await prisma.scoringFormat.delete({ where: { id: format.id } });
  res.status(204).end();
}));

app.patch("/api/admin/scoring/:eventId/tiers", requireAuth, requireStaff, asyncRoute(async (req, res) => {
  const input = parse(z.object({
    tiers: z.array(z.object({ id: z.string().trim().min(1).max(80), name: z.string().trim().min(1).max(80) })).min(1).max(3)
  }), req.body);
  if (new Set(input.tiers.map((tier) => tier.id)).size !== input.tiers.length
    || new Set(input.tiers.map((tier) => tier.name.toLocaleLowerCase("id-ID"))).size !== input.tiers.length) {
    throw apiError(400, "ID dan nama tingkatan harus unik.");
  }
  const event = await prisma.event.findUnique({
    where: { id: req.params.eventId },
    include: { registrations: { select: { id: true, scoringTierId: true, scores: { select: { id: true } } } } }
  });
  if (!event) throw apiError(404, "Event tidak ditemukan.");
  const currentConfiguration = event.scoringConfiguration || event.scoringFormat?.configuration || {};
  const currentTiers = Array.isArray(currentConfiguration.tiers) && currentConfiguration.tiers.length
    ? currentConfiguration.tiers
    : [{ id: "default", name: "Tingkat 1", formatId: event.scoringFormatId || null, configuration: currentConfiguration }];
  const nextIds = new Set(input.tiers.map((tier) => tier.id));
  const removedIds = currentTiers.filter((tier) => !nextIds.has(tier.id)).map((tier) => tier.id);
  const hasDataInRemovedTier = event.registrations.some((registration) =>
    removedIds.includes(registration.scoringTierId || currentTiers[0].id) && registration.scores.length > 0);
  const hasAssignedParticipant = event.registrations.some((registration) =>
    removedIds.includes(registration.scoringTierId || currentTiers[0].id));
  if (hasDataInRemovedTier || hasAssignedParticipant) {
    throw apiError(409, "Tingkatan tidak dapat dihapus selama masih memiliki peserta atau nilai. Pindahkan peserta terlebih dahulu.");
  }
  const tiers = input.tiers.map((tier) => ({
    ...currentTiers.find((existing) => existing.id === tier.id),
    ...tier
  }));
  const nextConfiguration = {
    ...currentConfiguration,
    tiers,
    categories: currentConfiguration.categories || [],
    judges: currentConfiguration.judges || [],
    penalties: currentConfiguration.penalties || []
  };
  await prisma.event.update({ where: { id: event.id }, data: { scoringConfiguration: nextConfiguration } });
  res.json({ tiers });
}));

app.patch("/api/admin/scoring/:eventId/participants/:registrationId/tier", requireAuth, requireStaff, asyncRoute(async (req, res) => {
  const input = parse(z.object({ tierId: z.string().min(1) }), req.body);
  const event = await prisma.event.findUnique({ where: { id: req.params.eventId }, select: { id: true, scoringConfiguration: true } });
  if (!event) throw apiError(404, "Event tidak ditemukan.");
  const tiers = Array.isArray(event.scoringConfiguration?.tiers) && event.scoringConfiguration.tiers.length
    ? event.scoringConfiguration.tiers
    : [{ id: "default", name: "Tingkat 1" }];
  if (!tiers.some((tier) => tier.id === input.tierId)) throw apiError(400, "Tingkatan tidak tersedia pada event ini.");
  const registration = await prisma.eventRegistration.findFirst({
    where: { id: req.params.registrationId, eventId: event.id, status: "APPROVED" },
    include: { scores: { select: { criterion: { select: { tierId: true } } } } }
  });
  if (!registration) throw apiError(404, "Peserta tidak ditemukan pada event ini.");
  if (registration.scores.some((score) => score.criterion.tierId !== input.tierId)) {
    throw apiError(409, "Peserta sudah memiliki nilai pada tingkatan berbeda dan tidak dapat dipindahkan.");
  }
  const updated = await prisma.eventRegistration.update({ where: { id: registration.id }, data: { scoringTierId: input.tierId } });
  res.json({ registration: updated });
}));

app.post("/api/admin/scoring-formats/apply", requireAuth, requireStaff, asyncRoute(async (req, res) => {
  const input = parse(z.object({ eventId: z.string().min(1), formatId: z.string().min(1), tierId: z.string().min(1).optional() }), req.body);
  const [event, format] = await Promise.all([
    prisma.event.findUnique({ where: { id: input.eventId }, select: { id: true, scoringFormatId: true, scoringConfiguration: true } }),
    prisma.scoringFormat.findUnique({ where: { id: input.formatId } })
  ]);
  if (!event || !format) throw apiError(404, "Event atau format penilaian tidak ditemukan.");
  const currentConfiguration = event.scoringConfiguration || format.configuration;
  const tiers = Array.isArray(currentConfiguration.tiers) && currentConfiguration.tiers.length
    ? currentConfiguration.tiers
    : [{ id: "default", name: "Tingkat 1", formatId: event.scoringFormatId || null, configuration: currentConfiguration }];
  const tierId = input.tierId || tiers[0].id;
  const tier = tiers.find((item) => item.id === tierId);
  if (!tier) throw apiError(400, "Tingkatan tidak tersedia pada event ini.");
  if (await prisma.competitionScore.count({ where: { eventId: event.id, criterion: { tierId } } })) {
    throw apiError(409, "Format tingkatan tidak dapat diganti setelah ada nilai. Buat tingkatan baru atau hapus nilai terlebih dahulu.");
  }
  const configuration = format.configuration;
  const criteria = configuration.categories.flatMap((category) => category.items.map((name) => ({
    eventId: event.id,
    tierId,
    categoryId: category.id,
    categoryName: category.name,
    name,
    weight: 1,
    minScore: 0,
    maxScore: 100,
    active: true
  })));
  await prisma.$transaction(async (tx) => {
    await tx.scoringCriterion.deleteMany({ where: { eventId: event.id, tierId } });
    if (criteria.length) await tx.scoringCriterion.createMany({ data: criteria });
    await tx.event.update({
      where: { id: event.id },
      data: {
        scoringFormatId: event.scoringFormatId || format.id,
        scoringFormatAppliedAt: new Date(),
        scoringConfiguration: {
          ...configuration,
          tiers: tiers.map((item) => item.id === tierId ? { ...item, formatId: format.id, configuration } : item)
        }
      }
    });
  });
  res.json({ message: "Format diterapkan ke tingkatan event.", eventId: event.id, formatId: format.id, tierId });
}));

app.patch("/api/admin/scoring/:eventId/settings", requireAuth, requireStaff, asyncRoute(async (req, res) => {
  const input = parse(z.object({ tierId: z.string().min(1).optional(), settings: scoringSettingsSchema }), req.body);
  const event = await getScoringEvent(req.params.eventId, input.tierId);
  const currentConfiguration = event.scoringConfiguration;
  if (!currentConfiguration) throw apiError(409, "Terapkan format penilaian terlebih dahulu.");
  const settings = { ...(currentConfiguration.settings || {}), ...input.settings };
  if (settings.maxPerformanceTime && !/^\d{2}:[0-5]\d$/.test(settings.maxPerformanceTime)) {
    throw apiError(400, "Waktu maksimal harus menggunakan format MM:SS.");
  }
  if (settings.maxPerformanceTime) {
    const [maxMinutes, maxSeconds] = settings.maxPerformanceTime.split(":").map(Number);
    const maximumSeconds = maxMinutes * 60 + maxSeconds;
    const existingTimeOverLimit = event.registrations.some((registration) => {
      const match = /^(\d{2}):([0-5]\d)$/.exec(registration.scoringTime || "");
      return match && Number(match[1]) * 60 + Number(match[2]) > maximumSeconds;
    });
    if (existingTimeOverLimit) throw apiError(409, "Waktu maksimal tidak dapat lebih rendah dari waktu tampil yang sudah tersimpan.");
  }
  const configuration = { ...currentConfiguration, settings };
  const tiers = event.scoringTiers.map((tier) => tier.id === event.activeTier.id ? { ...tier, configuration } : tier);
  const updatedConfiguration = { ...currentConfiguration, settings, tiers };
  await prisma.event.update({ where: { id: event.id }, data: { scoringConfiguration: updatedConfiguration } });
  res.json({ settings });
}));

app.post("/api/events/:eventId/scores", requireAuth, asyncRoute(async (req, res) => {
  if (!["ADMIN", "TEAM"].includes(req.user.role)) throw apiError(403, "Hanya Admin atau Tim Rekap yang dapat mencatat nilai.");
  const input = parse(z.object({ registrationId: z.string().min(1), criterionId: z.string().min(1), value: z.number().int().finite(), judgeLabel: z.string().trim().min(2).max(120) }), req.body);
  const [registration, criterion, event] = await Promise.all([
    prisma.eventRegistration.findFirst({ where: { id: input.registrationId, eventId: req.params.eventId, status: "APPROVED" }, select: { id: true } }),
    prisma.scoringCriterion.findFirst({ where: { id: input.criterionId, eventId: req.params.eventId, active: true } }),
    prisma.event.findUnique({ where: { id: req.params.eventId }, select: { scoringConfiguration: true, scoringFormat: { select: { configuration: true } } } })
  ]);
  if (!registration) throw apiError(404, "Peserta tidak terdaftar atau belum disetujui pada event ini.");
  if (!criterion) throw apiError(404, "Kriteria aktif tidak ditemukan pada event ini.");
  if (!event) throw apiError(404, "Event tidak ditemukan.");
  const configuration = event.scoringConfiguration || event.scoringFormat?.configuration;
  const judge = configuration?.judges?.find((item) => (item.label || item.name) === input.judgeLabel);
  if (!judge) throw apiError(403, "Label juri tidak tersedia pada konfigurasi penilaian event ini.");
  if (!judge.categoryIds?.includes(criterion.categoryId)) throw apiError(403, "Juri tidak memiliki hak akses untuk menilai kategori ini.");
  if (input.value < criterion.minScore || input.value > criterion.maxScore) throw apiError(400, `Nilai harus berada pada rentang ${criterion.minScore} sampai ${criterion.maxScore}.`);
  const score = await prisma.competitionScore.upsert({
    where: { registrationId_criterionId_judgeLabel: { registrationId: registration.id, criterionId: criterion.id, judgeLabel: input.judgeLabel } },
    create: { eventId: req.params.eventId, registrationId: registration.id, criterionId: criterion.id, judgeLabel: input.judgeLabel, value: input.value },
    update: { value: input.value }
  });
  res.json({ score });
}));

app.put("/api/admin/scoring/:eventId/participants/:registrationId/recap", requireAuth, requireStaff, asyncRoute(async (req, res) => {
  const input = parse(z.object({
    penaltyQuantities: z.record(z.number().int().min(0).max(100000)),
    performanceTime: z.string().trim().max(5).regex(/^$|^\d{2}:[0-5]\d$/)
  }), req.body);
  const [event, registration] = await Promise.all([
    prisma.event.findUnique({ where: { id: req.params.eventId }, select: { scoringConfiguration: true, scoringFormat: { select: { configuration: true } } } }),
    prisma.eventRegistration.findFirst({ where: { id: req.params.registrationId, eventId: req.params.eventId, status: "APPROVED" }, select: { id: true } })
  ]);
  if (!event) throw apiError(404, "Event tidak ditemukan.");
  if (!registration) throw apiError(404, "Peserta tidak terdaftar atau belum disetujui pada event ini.");
  const configuration = event.scoringConfiguration || event.scoringFormat?.configuration;
  const maximumTime = configuration?.settings?.maxPerformanceTime;
  const maximumMatch = /^(\d{2}):([0-5]\d)$/.exec(maximumTime || "");
  const timeMatch = /^(\d{2}):([0-5]\d)$/.exec(input.performanceTime);
  if (input.performanceTime && !timeMatch) throw apiError(400, "Waktu tampil harus menggunakan format MM:SS.");
  if (timeMatch && maximumMatch) {
    const timeSeconds = Number(timeMatch[1]) * 60 + Number(timeMatch[2]);
    const maximumSeconds = Number(maximumMatch[1]) * 60 + Number(maximumMatch[2]);
    if (timeSeconds > maximumSeconds) throw apiError(400, `Waktu tampil tidak boleh melebihi ${maximumTime}.`);
  }
  const availableIds = new Set((configuration?.penalties || []).map((penalty) => penalty.id));
  if (Object.keys(input.penaltyQuantities).some((id) => !availableIds.has(id))) {
    throw apiError(400, "Daftar pinalti berisi pilihan yang tidak valid.");
  }
  const updated = await prisma.eventRegistration.update({
    where: { id: registration.id },
    data: { scoringPenalties: input.penaltyQuantities, scoringTime: input.performanceTime },
    select: { id: true, scoringPenalties: true, scoringTime: true }
  });
  res.json({ penalties: updated.scoringPenalties, performanceTime: updated.scoringTime });
}));

app.get("/api/admin/scoring/:eventId/ranking", requireAuth, requireStaff, asyncRoute(async (req, res) => {
  const event = await getScoringEvent(req.params.eventId);
  const summary = scoringSummary(event);
  res.json({ event: { id: event.id, name: event.name }, method: "Jumlah nilai label juri yang ditugaskan per item, dikalikan bobot dan dikurangi penalti untuk klasemen akhir.", participants: summary.participants, rankings: summary.rankings, settings: summary.settings });
}));

app.get("/api/admin/users", requireAuth, requireStaff, asyncRoute(async (req, res) => {
  const status = ["PENDING", "ACTIVE", "REJECTED"].includes(req.query.status) ? req.query.status : undefined;
  const users = await prisma.user.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, name: true, email: true, googleId: true, phone: true, institution: true, eventName: true, role: true, status: true, createdAt: true }
  });
  res.json({ users });
}));

app.patch("/api/admin/users/:id/status", requireAuth, requireStaff, asyncRoute(async (req, res) => {
  const input = parse(z.object({ status: z.enum(["ACTIVE", "REJECTED"]) }), req.body);
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target || ["ADMIN", "TEAM"].includes(target.role)) throw apiError(404, "Akun tidak ditemukan.");
  const user = await prisma.user.update({ where: { id: target.id }, data: { status: input.status } });
  res.json({ user: publicUser(user) });
}));

app.delete("/api/admin/users/:id", requireAuth, requireStaff, asyncRoute(async (req, res) => {
  if (req.params.id === req.user.id) throw apiError(400, "Akun yang sedang digunakan tidak dapat dihapus dari sini.");
  const target = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { organizedEvents: true, registrations: true, payments: true } } }
  });
  if (!target || !["ORGANIZER", "PARTICIPANT"].includes(target.role)) throw apiError(404, "Akun penyelenggara atau peserta tidak ditemukan.");
  if (target._count.payments > 0) throw apiError(409, "Akun memiliki riwayat pembayaran dan tidak dapat dihapus. Gunakan penolakan atau nonaktifkan akun melalui status.");
  if (target.role === "ORGANIZER" && target._count.organizedEvents > 0) throw apiError(409, "Akun penyelenggara memiliki event. Pindahkan atau hapus event terlebih dahulu sebelum menghapus akun.");
  await prisma.user.delete({ where: { id: target.id } });
  res.json({ deleted: true, id: target.id });
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
    select: {
      id: true,
      eventId: true,
      userId: true,
      participantName: true,
      teamName: true,
      status: true,
      createdAt: true,
      user: { select: { email: true, phone: true } }
    }
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
  const products = await prisma.product.findMany({ orderBy: { createdAt: "desc" }, include: { variants: { orderBy: { size: "asc" } } } });
  res.json({ products });
}));

const productImageSchema = z.string().trim().max(1000).optional().or(z.literal("")).refine((value) => !value || value.startsWith("/uploads/") || /^https?:\/\//i.test(value), "Foto produk tidak valid.");

app.post("/api/admin/products", requireAuth, requireStaff, asyncRoute(async (req, res) => {
  const variantSchema = z.array(z.object({ size: z.string().trim().min(1).max(24), stock: z.number().int().min(0).max(100000) })).max(30).default([]);
  const input = parse(z.object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(2000).optional(),
    imageUrl: productImageSchema,
    price: z.number().int().min(1).max(100000000),
    stock: z.number().int().min(0).max(100000),
    variants: variantSchema
  }), req.body);
  const { variants, ...productData } = input;
  if (new Set(variants.map((variant) => variant.size.toLowerCase())).size !== variants.length) throw apiError(400, "Ukuran produk tidak boleh berulang.");
  const initialStock = variants.length ? variants.reduce((total, variant) => total + variant.stock, 0) : productData.stock;
  const product = await prisma.product.create({ data: { ...productData, stock: initialStock, ...(variants.length ? { variants: { create: variants } } : {}) }, include: { variants: true } });
  res.status(201).json({ product });
}));

app.patch("/api/admin/products/:id", requireAuth, requireStaff, asyncRoute(async (req, res) => {
  const input = parse(z.object({
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(2000).optional(),
    imageUrl: productImageSchema,
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

app.patch("/api/admin/product-variants/:id", requireAuth, requireStaff, asyncRoute(async (req, res) => {
  const input = parse(z.object({ stock: z.number().int().min(0).max(100000) }), req.body);
  const variant = await prisma.$transaction(async (tx) => {
    const existing = await tx.productVariant.findUnique({ where: { id: req.params.id } });
    if (!existing) throw apiError(404, "Varian tidak ditemukan.");
    const updated = await tx.productVariant.update({ where: { id: existing.id }, data: { stock: input.stock } });
    await tx.product.update({ where: { id: existing.productId }, data: { stock: { increment: input.stock - existing.stock } } });
    return updated;
  });
  res.json({ variant });
}));

app.use("/api", (req, res) => res.status(404).json({ error: "API tidak ditemukan." }));

const distPath = path.join(__dirname, "dist");
app.use("/uploads", express.static(uploadPath, { dotfiles: "deny", index: false, maxAge: production ? "1h" : 0 }));
app.use(express.static(path.join(__dirname, "public"), { index: false, maxAge: production ? "1h" : 0 }));
app.use(express.static(distPath, { index: false, maxAge: production ? "1h" : 0 }));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(distPath, "index.html"), (error) => {
    if (error) next(error);
  });
  settings: z.object({
    maxPerformanceTime: z.string().regex(/^\d{2}:[0-5]\d$/).optional().or(z.literal("")),
    tieBreakers: z.object({
      overall: z.object({ type: z.enum(["time", "category", "group"]), categoryId: z.string().optional(), groupId: z.string().optional() }).nullable().optional(),
      categories: z.record(z.object({ type: z.enum(["time", "category", "group"]), categoryId: z.string().optional(), groupId: z.string().optional() }).nullable()).optional()
    }).optional(),
    announcement: z.object({ enabled: z.boolean(), title: z.string().max(120), message: z.string().max(2000) }).optional(),
    kejuaraanApproved: z.boolean().optional()
  }).passthrough().optional()
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.type === "entity.too.large" ? 413 : Number.isInteger(error.status) ? error.status : 500;
  if (status === 413) error.message = "Ukuran poster maksimal 5 MB.";
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
