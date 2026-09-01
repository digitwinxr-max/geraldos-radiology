import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/audit", () => ({
  recordAudit: vi.fn().mockResolvedValue(undefined),
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
    // DEV_AUTH must be enabled for devGet to pass the gate; the limiter runs first.
    for (let i = 0; i < 5; i++) {
      const res = await devGet(request());
      // Either a 307 (bypass allowed) or 403 (bypass disabled) — the limiter
      // still counts every call.
      expect(res.status === 307 || res.status === 403).toBe(true);
    }

    const blocked = await devGet(request());
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
    const body = await blocked.json();
    expect(body.error.code).toBe("RATE_LIMITED");
  });

  it("serves requests again after the counters are reset", async () => {
    for (let i = 0; i < 5; i++) {
      await devGet(request());
    }

    const blocked = await devGet(request());
    expect(blocked.status).toBe(429);

    resetRateLimitsForTesting();

    const after = await devGet(request());
    expect(after.status).not.toBe(429);
  });
});
