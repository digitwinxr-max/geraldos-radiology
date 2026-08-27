/**
 * Gate 1 — edge authentication gate policy tests.
 *
 * The proxy must fail closed: production never serves protected traffic
 * without an identity provider, and the development bypass is an explicit
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

const session = { sub: "u1", name: "User", roles: ["radiologist"], iss: "keycloak" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  // Default scenario: Keycloak not configured, development mode.
  vi.stubEnv("KEYCLOAK_URL", "");
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
  it.each(["/login", "/api/health", "/api/metrics", "/api/auth/callback", "/_next/static/x"])(
    "passes %s through unconditionally",
    async (path) => {
      const res = await proxy(req(path));
      expect(isPassThrough(res)).toBe(true);
    },
  );
});

describe("Keycloak configured", () => {
  beforeEach(() => vi.stubEnv("KEYCLOAK_URL", "http://keycloak:8080"));

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
});

describe("Keycloak NOT configured — production", () => {
  beforeEach(() => vi.stubEnv("NODE_ENV", "production"));

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

  it("refuses the bypass even if DEV_AUTH is set", async () => {
    vi.stubEnv("DEV_AUTH", "true");

    const res = await proxy(req("/worklist"));

    expect(res.status).toBe(307);
    expect(isPassThrough(res)).toBe(false);
  });
});

describe("Keycloak NOT configured — development", () => {
  it("fails closed when DEV_AUTH is not explicitly enabled", async () => {
    const res = await proxy(req("/worklist"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "http://localhost/login?error=identity_not_configured",
    );
  });

  it("bypasses only when DEV_AUTH=true (explicit opt-in)", async () => {
    vi.stubEnv("DEV_AUTH", "true");

    const res = await proxy(req("/worklist"));

    expect(isPassThrough(res)).toBe(true);
    expect(verifySessionToken).not.toHaveBeenCalled();
  });
});
