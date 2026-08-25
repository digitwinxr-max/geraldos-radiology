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
 * currently unreachable. Failed connection attempts back off for 30 s to
 * avoid reconnect storms.
 */
export async function getRedis(): Promise<import("ioredis").Redis | null> {
  const { redis } = integrationConfig;
  if (!redis.url) return null;
  if (redisClient) return redisClient;
  // Back off for 30s after a failed attempt to avoid reconnect storms.
  if (redisFailedAt && Date.now() - redisFailedAt < 30_000) return null;
  try {
    const { default: Redis } = await import("ioredis");
    redisClient = new Redis(redis.url, {
      connectTimeout: 2000,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
      lazyConnect: true,
    });
    redisClient.on("error", () => {
      redisFailedAt = Date.now();
    });
    await redisClient.connect();
    return redisClient;
  } catch {
    redisFailedAt = Date.now();
    redisClient = null;
    return null;
  }
}
