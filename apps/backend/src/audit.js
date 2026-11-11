import { prisma } from "./db.js";
export async function audit(actorId, action, target, meta) {
  try {
    await prisma.auditLog.create({ data: { actorId, action, target, meta } });
  } catch (e) {
    console.error("audit failed", e.message);
  }
}
