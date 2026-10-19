require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

function validateSeedAccount({ name, email, phone, password, role }) {
  const prefix = `${role}_`;
  const missing = [];
  if (!name) missing.push(`${prefix}NAME`);
  if (!email || email.endsWith("@example.com")) missing.push(`${prefix}EMAIL`);
  if (!phone) missing.push(`${prefix}PHONE`);
  if (!password || password.length < 12 || password.includes("replace-with")) {
    missing.push(`${prefix}PASSWORD (minimum 12 characters)`);
  }
  if (missing.length) {
    throw new Error(`Invalid seed configuration: ${missing.join(", ")}.`);
  }
}

async function seedAccount({ name, email, phone, password, role }) {
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    update: { name, phone, role, status: "ACTIVE", phoneVerifiedAt: new Date() },
    create: {
      name,
      email: email.toLowerCase(),
      phone,
      passwordHash,
      role,
      status: "ACTIVE",
      phoneVerifiedAt: new Date()
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
  accounts.forEach(validateSeedAccount);
  for (const account of accounts) await seedAccount(account);
  console.log("Seed accounts are ready. Keep the credentials private and change them after first sign-in.");
}

main()
  .catch((error) => {
    console.error("Database seed failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
