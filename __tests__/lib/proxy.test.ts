/**
 * Gate 1 — edge authentication gate policy tests.
 *
 * The proxy must fail closed: production never serves protected traffic
 * without a valid session, and the development bypass is an explicit
 * DEV_AUTH=true opt-in.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/session", () => ({
  SESSION_COOKIE: "geraldos_session",
  verifySessionToken: vi.fn(),
}));

import { verifySessionToken } from "@/lib/auth/session";
import { proxy } from "@/proxy";

const session = { sub: "u1", name: "User", roles: ["radiologist"], iss: "geraldos-native" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  // Default scenario: development mode, DEV_AUTH not enabled.
  vi.stubEnv("DEV_AUTH", "");
  vi.stubEnv("NODE_ENV", "development");
});
afterEach(() => vi.unstubAllEnvs());

function req(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`);
}

function isPassThrough(res: Response): boolean {
  return res.headers.get("x-middleware-next") === "1";
}

describe("public routes", () => {
  it.each([
    "/login",
    "/api/health",
    "/api/metrics",
    "/api/auth/login",
    "/api/auth/me",
    "/_next/static/x",
    // The public /login screen renders <img src="/gh-logo.png">. Gating it
    // redirects the image request to /login, so the browser gets HTML instead
    // of a PNG and the logo is broken for every signed-out user.
    "/gh-logo.png",
  ])("passes %s through unconditionally", async (path) => {
    const res = await proxy(req(path));
    expect(isPassThrough(res)).toBe(true);
  });
});

describe("valid session", () => {
  it("passes a request with a valid session", async () => {
    vi.mocked(verifySessionToken).mockResolvedValue(session as never);

    const res = await proxy(
      new NextRequest("http://localhost/worklist", {
        headers: { cookie: "geraldos_session=valid-token" },
      }),
    );

    expect(isPassThrough(res)).toBe(true);
    expect(verifySessionToken).toHaveBeenCalledWith("valid-token");
  });
});

describe("DEV_AUTH disabled — development fails closed", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_AUTH", "");
  });

  it("returns 503 IDENTITY_NOT_CONFIGURED for API requests", async () => {
    const res = await proxy(req("/api/patients"));

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe("IDENTITY_NOT_CONFIGURED");
  });

  it("redirects page requests to the login screen with an explanation", async () => {
    const res = await proxy(req("/worklist"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "http://localhost/login?error=identity_not_configured",
    );
  });

  it("still fails closed when an invalid session cookie is presented", async () => {
    vi.mocked(verifySessionToken).mockResolvedValue(null);

    const res = await proxy(
      new NextRequest("http://localhost/api/worklist", {
        headers: { cookie: "geraldos_session=expired" },
      }),
    );

    expect(res.status).toBe(503);
    expect(isPassThrough(res)).toBe(false);
  });
});

describe("DEV_AUTH disabled — production", () => {
  beforeEach(() => vi.stubEnv("NODE_ENV", "production"));

  it("returns 401 JSON for unauthenticated API requests", async () => {
    const res = await proxy(req("/api/patients"));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("redirects unauthenticated page requests to /login", async () => {
    const res = await proxy(req("/worklist"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/login");
  });

  it("rejects an invalid session token", async () => {
    vi.mocked(verifySessionToken).mockResolvedValue(null);

    const res = await proxy(
      new NextRequest("http://localhost/api/worklist", {
        headers: { cookie: "geraldos_session=expired" },
      }),
    );

    expect(res.status).toBe(401);
  });

  it("refuses the dev bypass even if DEV_AUTH is set", async () => {
    vi.stubEnv("DEV_AUTH", "true");

    const apiRes = await proxy(req("/api/worklist"));
    expect(apiRes.status).toBe(401);

    const pageRes = await proxy(req("/worklist"));
    expect(pageRes.status).toBe(307);
    expect(pageRes.headers.get("location")).toBe("http://localhost/login");
    expect(isPassThrough(pageRes)).toBe(false);
  });
});

describe("DEV_AUTH enabled — development bypass", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_AUTH", "true");
  });

  it("passes protected traffic through without a session", async () => {
    const res = await proxy(req("/worklist"));

    expect(isPassThrough(res)).toBe(true);
  });

  it("passes protected traffic through even when an invalid session is presented (dev-only degradation)", async () => {
    vi.mocked(verifySessionToken).mockResolvedValue(null);

    const res = await proxy(
      new NextRequest("http://localhost/api/worklist", {
        headers: { cookie: "geraldos_session=expired" },
      }),
    );

    expect(isPassThrough(res)).toBe(true);
  });
});
