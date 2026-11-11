import jwt from "jsonwebtoken";
import { prisma } from "./db.js";

const secret = () => {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET not set");
  return process.env.JWT_SECRET;
};

export const signToken = (user) =>
  jwt.sign({ sub: user.id, role: user.role }, secret(), { expiresIn: "8h" });

export async function requireAuth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    const payload = jwt.verify(token, secret());
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== "ACTIVE") return res.status(403).json({ error: "Account disabled" });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: "Forbidden" });
