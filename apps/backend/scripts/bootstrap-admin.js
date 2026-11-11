// Creates (or promotes) the first administrator. Run: npm run admin:bootstrap
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const email = (process.env.ADMIN_EMAIL || "").toLowerCase();
const password = process.env.ADMIN_PASSWORD || "";
if (!email || password.length < 10) {
  console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD (min 10 chars).");
  process.exit(1);
}
const prisma = new PrismaClient();
const passwordHash = await bcrypt.hash(password, 12);
const user = await prisma.user.upsert({
  where: { email },
  update: { role: "ADMIN", status: "ACTIVE", passwordHash },
  create: { email, name: "Administrator", role: "ADMIN", passwordHash },
});
await prisma.auditLog.create({ data: { actorId: user.id, action: "ADMIN_BOOTSTRAPPED", target: user.id } });
console.log("Admin ready:", user.email);
await prisma.$disconnect();
