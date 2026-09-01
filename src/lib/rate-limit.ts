/**
 * GeraldOS — Rate Limiting
 *
 * Fixed-window counters keyed by bucket + client IP, stored in an in-memory
 * map. The store is capped (MEMORY_MAX_KEYS) so a flood of unique keys cannot
 * grow it unbounded — the cap clears the map rather than leaking memory.
 *
 * NOTE: per-instance counters only. Multi-instance deployments should place a
 * shared rate-limiter (e.g. a reverse proxy) in front of the app; the
 * application limiter is protection against per-instance abuse.
 */

import type { NextRequest } from "next/server";

export interface RateLimitOptions {
  /** Maximum number of requests allowed inside the window. */
  limit: number;
  /** Window length in seconds. */
  windowSec: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the current window resets (meaningful when blocked). */
  retryAfterSec: number;
}

// ─── Client IP extraction ───

/**
 * Best-effort client IP: first hop of x-forwarded-for (set by the reverse
 * proxy), then x-real-ip, then "unknown".
 */
export function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

// ─── In-memory store ───

interface MemoryEntry {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, MemoryEntry>();

/** Cap the store so a flood of unique keys cannot grow it unbounded. */
const MEMORY_MAX_KEYS = 10_000;

function memoryCheck(key: string, opts: RateLimitOptions, now: number): RateLimitResult {
  const entry = memoryStore.get(key);
  if (!entry || entry.resetAt <= now) {
    if (memoryStore.size >= MEMORY_MAX_KEYS) memoryStore.clear();
    memoryStore.set(key, { count: 1, resetAt: now + opts.windowSec * 1000 });
    return { allowed: true, retryAfterSec: 0 };
  }
  entry.count += 1;
  const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
  return { allowed: entry.count <= opts.limit, retryAfterSec };
}

// ─── Public API ───

/**
 * Consume one request from the given bucket for the requesting client.
 * Optionally accepts an explicit key subject (e.g. an authenticated user id)
 * instead of the client IP.
 */
export async function checkRateLimit(
  bucket: string,
  request: NextRequest,
  opts: RateLimitOptions,
  subject?: string,
): Promise<RateLimitResult> {
  const key = `${bucket}:${subject ?? clientIp(request)}`;
  return memoryCheck(key, opts, Date.now());
}

/** Clear every in-memory counter. Test-only. */
export function resetRateLimitsForTesting(): void {
  memoryStore.clear();
}
