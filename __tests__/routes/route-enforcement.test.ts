/**
 * Gate 1 — server-side route enforcement.
 *
 * Unlike the per-route suites (which mock `withAuth`), this file exercises the
 * REAL enforcement chain — CSRF → session cookie → permission — through an
 * actual protected route, proving authorisation lives on the server rather
 * than in UI hiding.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/db", async () => {
  const { dbMock } = await import("../helpers/db-mock");
  return { db: dbMock.db };
});
vi.mock("@/lib/audit", () => ({
  recordAudit: vi.fn().mockResolvedValue(undefined),
}));

import { dbMock } from "../helpers/db-mock";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth/session";
import { GET, POST } from "@/app/api/staff/route";

const ORIGIN = "http://localhost";

async function sessionCookie(roles: string[]): Promise<string> {
  const token = await createSessionToken({
    sub: `user-${roles.join("-") || "anon"}`,
    name: "Enforcement Test User",
    roles,
    iss: "geraldos-test",
  });
  return `${SESSION_COOKIE}=${token}`;
}

function getRequest(cookie?: string): NextRequest {
  return new NextRequest(`${ORIGIN}/api/staff`, {
    headers: cookie ? { cookie } : {},
  });
}

beforeEach(() => {
  dbMock.reset();
  vi.clearAllMocks();
});

describe("GET /api/staff (requires administration.read) — real withAuth", () => {
  it("returns 401 when no session cookie is present", async () => {
    const res = await GET(getRequest());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(dbMock.calls).toHaveLength(0);
  });

  it("returns 401 for an invalid session token", async () => {
    const res = await GET(getRequest(`${SESSION_COOKIE}=forged.token.value`));

    expect(res.status).toBe(401);
    expect(dbMock.calls).toHaveLength(0);
  });

  it("returns 403 for a valid session lacking the permission (receptionist)", async () => {
    const res = await GET(getRequest(await sessionCookie(["receptionist"])));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
    expect(dbMock.calls).toHaveLength(0);
  });

  it("returns 200 for a role holding the permission (manager)", async () => {
    dbMock.result([{ id: "staff-1", firstName: "Ada", lastName: "Lovelace" }]);
    dbMock.result([{ count: 1 }]);

    const res = await GET(getRequest(await sessionCookie(["manager"])));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.meta.total).toBe(1);
  });

  it("returns 200 for the administrator wildcard", async () => {
    dbMock.result([]);
    dbMock.result([{ count: 0 }]);

    const res = await GET(getRequest(await sessionCookie(["administrator"])));

    expect(res.status).toBe(200);
  });

  it("tags every enforced response with a request id", async () => {
    const res = await GET(getRequest());

    expect(res.headers.get("x-request-id")).toBeTruthy();
  });
});

describe("POST /api/staff — CSRF applies to mutations even with a valid session", () => {
  it("rejects a cross-origin mutation with CSRF_REJECTED before any session check", async () => {
    const req = new NextRequest(`${ORIGIN}/api/staff`, {
      method: "POST",
      headers: {
        origin: "http://evil.example",
        cookie: await sessionCookie(["administrator"]),
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });

    const res = await POST(req);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("CSRF_REJECTED");
  });

  it("requires a session on same-origin mutations", async () => {
    const req = new NextRequest(`${ORIGIN}/api/staff`, {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req);

    expect(res.status).toBe(401);
  });
});
