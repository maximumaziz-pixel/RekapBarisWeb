require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { hashPassword, isStrongPassword } = require("../auth-password");
const { normalizePhone, whatsappRecipient } = require("../phone");
const prisma = new PrismaClient();

function validateSeedAccount({ name, email, phone, password, role }) {
  const prefix = `${role}_`;
  const missing = [];
  if (!name) missing.push(`${prefix}NAME`);
  if (!email || email.endsWith("@example.com") || email.endsWith("@your-domain.com")) missing.push(`${prefix}EMAIL`);
  if (!normalizePhone(phone)) missing.push(`${prefix}PHONE (valid phone number required for WhatsApp password reset)`);
  if (!isStrongPassword(password) || /^(replace-|change-me)/i.test(password)) {
    missing.push(`${prefix}PASSWORD (minimum 8 characters with letters, numbers, and symbols)`);
  }
  if (missing.length) {
    throw new Error(`Invalid seed configuration: ${missing.join(", ")}.`);
  }
}

async function seedAccount({ name, email, phone, password, role }) {
  const passwordHash = await hashPassword(password);
  await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    update: { name, phone: normalizePhone(phone), role, status: "ACTIVE", passwordHash },
    create: {
      name,
      email: email.toLowerCase(),
      phone: normalizePhone(phone),
      passwordHash,
      role,
      status: "ACTIVE"
    }
  });
}

async function main() {
  const accounts = [
    {
      name: process.env.ADMIN_NAME,
      email: process.env.ADMIN_EMAIL,
      phone: process.env.ADMIN_PHONE,
      password: process.env.ADMIN_PASSWORD,
      role: "ADMIN"
    },
    {
      name: process.env.TEAM_NAME,
      email: process.env.TEAM_EMAIL,
      phone: process.env.TEAM_PHONE,
      password: process.env.TEAM_PASSWORD,
      role: "TEAM"
    }
  ];
  if (accounts[0].email?.toLowerCase() === accounts[1].email?.toLowerCase()) {
    throw new Error("ADMIN_EMAIL and TEAM_EMAIL must be different.");
  }
  if (accounts[0].name?.trim().toLowerCase() === accounts[1].name?.trim().toLowerCase()) {
    throw new Error("ADMIN_NAME and TEAM_NAME must be different.");
  }
  if (whatsappRecipient(accounts[0].phone) === whatsappRecipient(accounts[1].phone)) {
    throw new Error("ADMIN_PHONE and TEAM_PHONE must be different.");
  }
  accounts.forEach(validateSeedAccount);
  for (const account of accounts) await seedAccount(account);
  console.log("Staff accounts are ready for email/username and password sign-in.");
}

main()
  .catch((error) => {
    console.error("Database seed failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
