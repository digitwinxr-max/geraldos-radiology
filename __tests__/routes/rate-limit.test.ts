import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/audit", () => ({
  recordAudit: vi.fn().mockResolvedValue(undefined),
}));
// Force the in-memory rate-limit path regardless of environment configuration.
vi.mock("@/lib/redis", () => ({
  getRedis: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/auth/oidc", () => ({
  keycloakConfigured: vi.fn().mockReturnValue(false),
}));

import { GET as devGet } from "@/app/api/auth/dev/route";
import { resetRateLimitsForTesting } from "@/lib/rate-limit";

beforeEach(() => {
  resetRateLimitsForTesting();
});

function request(): NextRequest {
  return new NextRequest("http://localhost/api/auth/dev");
}

describe("rate limiting on /api/auth/dev", () => {
  it("allows the first five requests per minute and rejects the sixth with 429", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await devGet(request());
      expect(res.status).toBe(307);
    }

    const blocked = await devGet(request());
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
    const body = await blocked.json();
    expect(body.error.code).toBe("RATE_LIMITED");
  });

  it("serves requests again after the counters are reset", async () => {
    for (let i = 0; i < 5; i++) await devGet(request());
    expect((await devGet(request())).status).toBe(429);

    resetRateLimitsForTesting();

    expect((await devGet(request())).status).toBe(307);
  });
});
