import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Force the in-memory fallback path regardless of environment configuration.
vi.mock("@/lib/redis", () => ({
  getRedis: vi.fn().mockResolvedValue(null),
}));

import {
  checkRateLimit,
  clientIp,
  resetRateLimitsForTesting,
} from "@/lib/rate-limit";

function request(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/test", { headers });
}

beforeEach(() => {
  vi.useFakeTimers();
  resetRateLimitsForTesting();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("clientIp", () => {
  it("takes the first hop of x-forwarded-for", () => {
    expect(clientIp(request({ "x-forwarded-for": "10.0.0.1, 10.0.0.2" }))).toBe("10.0.0.1");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    expect(clientIp(request({ "x-real-ip": "10.0.0.9" }))).toBe("10.0.0.9");
  });

  it("returns 'unknown' when no proxy headers are present", () => {
    expect(clientIp(request())).toBe("unknown");
  });
});

describe("checkRateLimit (in-memory fallback)", () => {
  it("allows requests up to the limit then blocks with a retry hint", async () => {
    const opts = { limit: 3, windowSec: 60 };

    expect((await checkRateLimit("b", request(), opts)).allowed).toBe(true);
    expect((await checkRateLimit("b", request(), opts)).allowed).toBe(true);
    expect((await checkRateLimit("b", request(), opts)).allowed).toBe(true);

    const blocked = await checkRateLimit("b", request(), opts);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThanOrEqual(1);
    expect(blocked.retryAfterSec).toBeLessThanOrEqual(60);
  });

  it("resets the counter once the window elapses", async () => {
    const opts = { limit: 1, windowSec: 60 };

    expect((await checkRateLimit("b", request(), opts)).allowed).toBe(true);
    expect((await checkRateLimit("b", request(), opts)).allowed).toBe(false);

    vi.advanceTimersByTime(61_000);

    expect((await checkRateLimit("b", request(), opts)).allowed).toBe(true);
  });

  it("tracks clients independently via x-forwarded-for", async () => {
    const opts = { limit: 1, windowSec: 60 };

    expect((await checkRateLimit("b", request({ "x-forwarded-for": "1.1.1.1" }), opts)).allowed).toBe(true);
    expect((await checkRateLimit("b", request({ "x-forwarded-for": "1.1.1.1" }), opts)).allowed).toBe(false);
    // A different client still has its full budget.
    expect((await checkRateLimit("b", request({ "x-forwarded-for": "2.2.2.2" }), opts)).allowed).toBe(true);
  });

  it("keeps buckets independent for the same client", async () => {
    const opts = { limit: 1, windowSec: 60 };

    expect((await checkRateLimit("auth:dev", request(), opts)).allowed).toBe(true);
    expect((await checkRateLimit("auth:dev", request(), opts)).allowed).toBe(false);
    expect((await checkRateLimit("webhooks:n8n", request(), opts)).allowed).toBe(true);
  });

  it("keys on the explicit subject instead of the client IP when provided", async () => {
    const opts = { limit: 1, windowSec: 60 };

    expect((await checkRateLimit("agents:chat", request({ "x-forwarded-for": "1.1.1.1" }), opts, "user-a")).allowed).toBe(true);
    // Same user from a different IP is still blocked.
    expect((await checkRateLimit("agents:chat", request({ "x-forwarded-for": "9.9.9.9" }), opts, "user-a")).allowed).toBe(false);
    // A different user from the same IP is not.
    expect((await checkRateLimit("agents:chat", request({ "x-forwarded-for": "1.1.1.1" }), opts, "user-b")).allowed).toBe(true);
  });

  it("resetRateLimitsForTesting clears every counter", async () => {
    const opts = { limit: 1, windowSec: 60 };

    expect((await checkRateLimit("b", request(), opts)).allowed).toBe(true);
    expect((await checkRateLimit("b", request(), opts)).allowed).toBe(false);

    resetRateLimitsForTesting();

    expect((await checkRateLimit("b", request(), opts)).allowed).toBe(true);
  });
});
