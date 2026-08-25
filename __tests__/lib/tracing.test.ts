import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/rbac", () => ({
  requirePermission: vi.fn(),
}));

import { withAuth } from "@/lib/middleware-helpers";
import { requirePermission } from "@/lib/rbac";
import { unauthorized } from "@/lib/api-error";
import { metricsSnapshot, resetMetricsForTesting } from "@/lib/metrics";
import type { SessionUser } from "@/lib/auth/session";

const mockUser: SessionUser = {
  sub: "user-42",
  name: "Tracey Tracer",
  roles: ["administrator"],
  iss: "geraldos-test",
};

let stdoutSpy: MockInstance<(chunk: unknown) => boolean>;
let stderrSpy: MockInstance<(chunk: unknown) => boolean>;

beforeEach(() => {
  vi.clearAllMocks();
  resetMetricsForTesting();
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});
afterEach(() => vi.restoreAllMocks());

function stdoutLines(): Record<string, unknown>[] {
  return stdoutSpy.mock.calls.map((c) => JSON.parse(String(c[0])));
}
function stderrLines(): Record<string, unknown>[] {
  return stderrSpy.mock.calls.map((c) => JSON.parse(String(c[0])));
}

function request(): NextRequest {
  return new NextRequest("http://localhost/api/test", { method: "POST" });
}

function allow() {
  vi.mocked(requirePermission).mockResolvedValue({ ok: true, user: mockUser });
}

describe("withAuth request tracing", () => {
  it("returns the handler response with an X-Request-Id header and access log", async () => {
    allow();

    const res = await withAuth(request(), "patients.read", async () => NextResponse.json({ ok: 1 }));

    expect(res.status).toBe(200);
    const requestId = res.headers.get("x-request-id");
    expect(requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

    const [line] = stdoutLines();
    expect(line.msg).toBe("POST /api/test");
    expect(line.status).toBe(200);
    expect(line.durationMs).toBeGreaterThanOrEqual(0);
    expect(line.requestId).toBe(requestId);
    expect(line.userId).toBe("user-42");

    const snap = metricsSnapshot();
    expect(snap.requestsTotal).toBe(1);
    expect(snap.byRoute["/api/test"]).toBe(1);
    expect(snap.byStatusClass["2xx"]).toBe(1);
  });

  it("still traces and records auth failures without invoking the handler", async () => {
    vi.mocked(requirePermission).mockResolvedValue({ ok: false, response: unauthorized() });
    const handler = vi.fn(async () => NextResponse.json({}));

    const res = await withAuth(request(), "patients.write", handler);

    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
    expect(res.headers.get("x-request-id")).toBeTruthy();

    const [line] = stdoutLines();
    expect(line.status).toBe(401);
    expect(line).not.toHaveProperty("userId");

    expect(metricsSnapshot().byStatusClass["4xx"]).toBe(1);
  });

  it("captures unhandled handler errors as a logged, safe 500", async () => {
    allow();

    const res = await withAuth(request(), "patients.read", async () => {
      throw new Error("boom");
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).not.toContain("boom");

    const [errLine] = stderrLines();
    expect(errLine.msg).toBe("Internal server error");
    expect((errLine.err as { message: string }).message).toBe("boom");
    // Context enrichment reached the error entry too.
    expect(errLine.path).toBe("/api/test");
    expect(errLine.userId).toBe("user-42");

    const access = stdoutLines()[0];
    expect(access.status).toBe(500);

    const snap = metricsSnapshot();
    expect(snap.errorsTotal).toBe(1);
    expect(snap.byStatusClass["5xx"]).toBe(1);
  });
});
