require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function validateSeedAccount({ name, email, role }) {
  const prefix = `${role}_`;
  const missing = [];
  if (!name) missing.push(`${prefix}NAME`);
  if (!email || email.endsWith("@example.com") || email.endsWith("@your-domain.com")) missing.push(`${prefix}EMAIL`);
  if (missing.length) {
    throw new Error(`Invalid seed configuration: ${missing.join(", ")}.`);
  }
}

async function seedAccount({ name, email, role }) {
  await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    update: { name, role, status: "ACTIVE" },
    create: {
      name,
      email: email.toLowerCase(),
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
      role: "ADMIN"
    },
    {
      name: process.env.TEAM_NAME,
      email: process.env.TEAM_EMAIL,
      role: "TEAM"
    }
  ];
  accounts.forEach(validateSeedAccount);
  for (const account of accounts) await seedAccount(account);
  console.log("Staff accounts are ready. Sign in with the matching verified Google email.");
}

main()
  .catch((error) => {
    console.error("Database seed failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
