import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { checkCsrf } from "@/lib/csrf";
import { requirePermission } from "@/lib/rbac";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth/session";

const ORIGIN = "http://localhost";

function request(
  method: string,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest(`${ORIGIN}/api/patients`, { method, headers });
}

describe("checkCsrf", () => {
  it("never checks safe methods", () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      expect(checkCsrf(request(method, { origin: "http://evil.example" }))).toBeNull();
    }
  });

  it("accepts mutations whose Origin matches the request host", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(checkCsrf(request(method, { origin: ORIGIN }))).toBeNull();
    }
  });

  it("rejects mutations from a foreign Origin", async () => {
    const res = checkCsrf(request("POST", { origin: "http://evil.example" }));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
    const body = await res!.json();
    expect(body.error.code).toBe("CSRF_REJECTED");
  });

  it("falls back to Referer when Origin is absent", () => {
    expect(checkCsrf(request("POST", { referer: `${ORIGIN}/worklist` }))).toBeNull();
  });

  it("rejects a foreign Referer", () => {
    expect(checkCsrf(request("POST", { referer: "http://evil.example/page" }))).not.toBeNull();
  });

  it("rejects a malformed Referer", () => {
    expect(checkCsrf(request("POST", { referer: "not a url" }))).not.toBeNull();
  });

  it("rejects mutations carrying neither Origin nor Referer", () => {
    expect(checkCsrf(request("POST"))).not.toBeNull();
  });

  it("prefers Origin over Referer when both are present", () => {
    expect(
      checkCsrf(request("POST", { origin: "http://evil.example", referer: `${ORIGIN}/x` })),
    ).not.toBeNull();
  });
});

describe("requirePermission CSRF integration", () => {
  let sessionCookie: string;

  beforeAll(async () => {
    const token = await createSessionToken({
      sub: "csrf-user",
      name: "CSRF User",
      roles: ["administrator"],
      iss: "geraldos-test",
    });
    sessionCookie = `${SESSION_COOKIE}=${token}`;
  });

  it("allows a same-origin authenticated mutation", async () => {
    const res = await requirePermission(
      request("POST", { origin: ORIGIN, cookie: sessionCookie }),
      "patients.write",
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.user.sub).toBe("csrf-user");
  });

  it("rejects a cross-origin mutation before any session check", async () => {
    const res = await requirePermission(
      request("POST", { origin: "http://evil.example", cookie: sessionCookie }),
      "patients.write",
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.response.status).toBe(403);
      const body = await res.response.json();
      expect(body.error.code).toBe("CSRF_REJECTED");
    }
  });

  it("still returns 401 for same-origin requests without a session", async () => {
    const res = await requirePermission(request("POST", { origin: ORIGIN }), "patients.write");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.response.status).toBe(401);
      const body = await res.response.json();
      expect(body.error.code).toBe("UNAUTHORIZED");
    }
  });
});
