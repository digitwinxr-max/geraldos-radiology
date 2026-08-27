/**
 * GeraldOS — Shared Redis Client
 *
 * Single lazy, non-fatal Redis connection shared by every consumer (event bus,
 * rate limiting). When REDIS_URL is not configured — or Redis is unreachable —
 * callers receive `null` and must fall back to their durable/in-memory path so
 * the platform never depends on Redis uptime.
 */

import { integrationConfig } from "@/lib/integrations";

let redisClient: import("ioredis").Redis | null = null;
let redisFailedAt = 0;

/**
 * Return a connected Redis client, or null when Redis is not configured or
 * currently unreachable. Failed connection attempts back off briefly to avoid
 * reconnect storms, but the client SELF-HEALS: ioredis retries with capped
 * backoff and a closed client is discarded so the next call rebuilds it.
 */
export async function getRedis(): Promise<import("ioredis").Redis | null> {
  const { redis } = integrationConfig;
  if (!redis.url) return null;
  if (redisClient && redisClient.status !== "end") return redisClient;
  // Back off briefly after a failed attempt to avoid reconnect storms.
  if (redisFailedAt && Date.now() - redisFailedAt < 3_000) return null;
  try {
    const { default: Redis } = await import("ioredis");
    redisClient?.disconnect();
    const created = new Redis(redis.url, {
      connectTimeout: 2000,
      maxRetriesPerRequest: 1,
      // Self-healing reconnect: capped linear backoff instead of giving up.
      retryStrategy: (times) => Math.min(times * 500, 3000),
      lazyConnect: true,
    });
    created.on("error", () => {
      redisFailedAt = Date.now();
    });
    created.on("end", () => {
      // Connection closed for good — drop the handle so callers recreate it.
      if (redisClient === created) redisClient = null;
    });
    redisClient = created;
    await created.connect();
    return created;
  } catch {
    redisFailedAt = Date.now();
    redisClient?.disconnect();
    redisClient = null;
    return null;
  }
}
