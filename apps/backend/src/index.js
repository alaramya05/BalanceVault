import express from "express";
import cors from "cors";
import helmet from "helmet";
import bcrypt from "bcryptjs";
import { z } from "zod";
import crypto from "node:crypto";
import { prisma } from "./db.js";
import { audit } from "./audit.js";
import { signToken, requireAuth, requireRole } from "./auth.js";
import { apiLimiter, authLimiter, redis } from "./rateLimit.js";

const app = express();
app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: (process.env.CORS_ORIGIN || "http://localhost:5173").split(",") }));
app.use(express.json({ limit: "100kb" }));

// ---- Health / readiness (no rate limit) ----
app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.get("/ready", async (_req, res) => {
  const checks = { database: false, redis: redis ? false : "disabled" };
  try { await prisma.$queryRaw`SELECT 1`; checks.database = true; } catch {}
  if (redis) { try { checks.redis = (await redis.ping()) === "PONG"; } catch {} }
  const ok = checks.database === true && (checks.redis === true || checks.redis === "disabled");
  res.status(ok ? 200 : 503).json({ status: ok ? "ready" : "not_ready", checks });
});

app.use("/api", apiLimiter);

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const parse = (schema, body, res) => {
  const r = schema.safeParse(body);
  if (!r.success) { res.status(400).json({ error: "Invalid input", details: r.error.flatten() }); return null; }
  return r.data;
};

// ---- Auth ----
const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(10).max(128),
});

app.post("/api/auth/register", authLimiter, wrap(async (req, res) => {
  const d = parse(registerSchema, req.body, res); if (!d) return;
  const email = d.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) return res.status(409).json({ error: "Email already registered" });
  const user = await prisma.user.create({
    data: { name: d.name, email, passwordHash: await bcrypt.hash(d.password, 12) },
  });
  await audit(user.id, "USER_REGISTERED", user.id);
  res.status(201).json({ token: signToken(user), user: pub(user) });
}));

app.post("/api/auth/login", authLimiter, wrap(async (req, res) => {
  const d = parse(z.object({ email: z.string().email(), password: z.string().min(1) }), req.body, res); if (!d) return;
  const user = await prisma.user.findUnique({ where: { email: d.email.toLowerCase() } });
  const ok = user && (await bcrypt.compare(d.password, user.passwordHash));
  if (!ok) { await audit(null, "LOGIN_FAILED", d.email.toLowerCase()); return res.status(401).json({ error: "Invalid credentials" }); }
  if (user.status !== "ACTIVE") return res.status(403).json({ error: "Account suspended" });
  await audit(user.id, "LOGIN_SUCCESS", user.id);
  res.json({ token: signToken(user), user: pub(user) });
}));

app.get("/api/auth/me", requireAuth, (req, res) => res.json({ user: pub(req.user) }));

const pub = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, status: u.status });

// ---- Account holder: onboarding ----
app.post("/api/accounts", requireAuth, requireRole("ACCOUNT_HOLDER"), wrap(async (req, res) => {
  const d = parse(z.object({ type: z.enum(["CHECKING", "SAVINGS"]) }), req.body, res); if (!d) return;
  const number = Array.from(crypto.randomBytes(10)).map((b) => b % 10).join("");
  const account = await prisma.account.create({ data: { ownerId: req.user.id, type: d.type, number } });
  await audit(req.user.id, "ACCOUNT_APPLIED", account.id, { type: d.type });
  res.status(201).json({ account });
}));

app.get("/api/accounts", requireAuth, wrap(async (req, res) => {
  const accounts = await prisma.account.findMany({ where: { ownerId: req.user.id }, orderBy: { createdAt: "desc" } });
  res.json({ accounts });
}));

// ---- Admin ----
const admin = [requireAuth, requireRole("ADMIN")];

app.get("/api/admin/users", ...admin, wrap(async (_req, res) => {
  const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, email: true, name: true, role: true, status: true, createdAt: true } });
  res.json({ users });
}));

app.patch("/api/admin/users/:id/status", ...admin, wrap(async (req, res) => {
  const d = parse(z.object({ status: z.enum(["ACTIVE", "SUSPENDED"]) }), req.body, res); if (!d) return;
  if (req.params.id === req.user.id) return res.status(400).json({ error: "Cannot change your own status" });
  const user = await prisma.user.update({ where: { id: req.params.id }, data: { status: d.status } });
  await audit(req.user.id, "USER_STATUS_CHANGED", user.id, { status: d.status });
  res.json({ user: pub(user) });
}));

app.get("/api/admin/accounts", ...admin, wrap(async (req, res) => {
  const where = req.query.status ? { status: String(req.query.status) } : {};
  const accounts = await prisma.account.findMany({ where, orderBy: { createdAt: "desc" }, include: { owner: { select: { email: true, name: true } } } });
  res.json({ accounts });
}));

for (const [action, status] of [["approve", "ACTIVE"], ["reject", "REJECTED"]]) {
  app.post(`/api/admin/accounts/:id/${action}`, ...admin, wrap(async (req, res) => {
    const account = await prisma.account.update({ where: { id: req.params.id }, data: { status } });
    await audit(req.user.id, `ACCOUNT_${status}`, account.id);
    res.json({ account });
  }));
}

app.get("/api/admin/audit", ...admin, wrap(async (req, res) => {
  const take = Math.min(Number(req.query.limit) || 100, 500);
  const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take, include: { actor: { select: { email: true } } } });
  res.json({ logs });
}));

// ---- Errors ----
app.use((req, res) => res.status(404).json({ error: "Not found" }));
app.use((err, _req, res, _next) => {
  console.error(err);
  if (err.code === "P2025") return res.status(404).json({ error: "Not found" });
  res.status(500).json({ error: "Internal error" });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`BalanceVault API on :${port}`));
