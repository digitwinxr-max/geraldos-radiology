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

/**
 * Render topology regression.
 *
 * On Render the container binds 0.0.0.0:$PORT and Next resolves
 * `request.nextUrl.origin` from that bind address, giving
 * `https://0.0.0.0:3000` — a value no browser can ever send as its Origin.
 * Comparing against `nextUrl.origin` therefore rejected EVERY authenticated
 * mutation in production (40 route files) while passing locally and in the
 * tests above. These cases pin the fixed behaviour.
 */
describe("checkCsrf behind a TLS-terminating reverse proxy (Render)", () => {
  const PUBLIC_ORIGIN = "https://geraldos-radiology.onrender.com";

  /** Mimics the real production request: bind-address URL + forwarded headers. */
  function proxied(headers: Record<string, string>): NextRequest {
    return new NextRequest("https://0.0.0.0:3000/api/patients", {
      method: "POST",
      headers: {
        host: "geraldos-radiology.onrender.com",
        "x-forwarded-proto": "https",
        ...headers,
      },
    });
  }

  it("accepts the real browser Origin even though nextUrl.origin is the bind address", () => {
    expect(proxied({}).nextUrl.origin).toBe("https://0.0.0.0:3000");
    expect(checkCsrf(proxied({ origin: PUBLIC_ORIGIN }))).toBeNull();
  });

  it("rejects the bind-address origin — a browser can never legitimately send it", () => {
    expect(checkCsrf(proxied({ origin: "https://0.0.0.0:3000" }))).not.toBeNull();
  });

  it("still rejects a foreign Origin behind the proxy", () => {
    const res = checkCsrf(proxied({ origin: "http://evil.example" }));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });

  it("accepts a Referer from the public origin", () => {
    expect(checkCsrf(proxied({ referer: `${PUBLIC_ORIGIN}/worklist` }))).toBeNull();
  });

  it("rejects a foreign Referer behind the proxy", () => {
    expect(checkCsrf(proxied({ referer: "http://evil.example/page" }))).not.toBeNull();
  });

  it("still rejects a mutation with neither Origin nor Referer", () => {
    expect(checkCsrf(proxied({}))).not.toBeNull();
  });

  it("accepts the operator-declared PUBLIC_APP_URL when a proxy strips forwarded headers", () => {
    const previous = process.env.PUBLIC_APP_URL;
    process.env.PUBLIC_APP_URL = PUBLIC_ORIGIN;
    try {
      // No host / x-forwarded-* headers at all: nextUrl.origin is the only
      // signal left, so PUBLIC_APP_URL is what keeps the deployment usable.
      const bare = new NextRequest("https://0.0.0.0:3000/api/patients", {
        method: "POST",
        headers: { origin: PUBLIC_ORIGIN },
      });
      expect(checkCsrf(bare)).toBeNull();
    } finally {
      if (previous === undefined) delete process.env.PUBLIC_APP_URL;
      else process.env.PUBLIC_APP_URL = previous;
    }
  });
});
