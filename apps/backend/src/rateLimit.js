import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import Redis from "ioredis";

export const redis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: false })
  : null;
if (redis) redis.on("error", (e) => console.error("redis:", e.message));

const make = (windowMs, limit, prefix) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    passOnStoreError: true,
    store: redis
      ? new RedisStore({ prefix, sendCommand: (...args) => redis.call(...args) })
      : undefined, // falls back to in-memory
  });

export const apiLimiter = make(60_000, 120, "rl:api:");
export const authLimiter = make(15 * 60_000, 20, "rl:auth:");
