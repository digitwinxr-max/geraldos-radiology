import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/db", async () => {
  const { dbMock } = await import("../helpers/db-mock");
  return { db: dbMock.db };
});
vi.mock("@/lib/auth/session", () => ({
  SESSION_COOKIE: "geraldos_session",
  secureCookieOptions: vi.fn(() => ({ httpOnly: true, sameSite: "lax", path: "/" })),
  createSessionToken: vi.fn().mockResolvedValue("session-token-123"),
  verifySessionToken: vi.fn(),
}));
vi.mock("@/lib/auth/password", () => ({
  verifyPassword: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({
  recordAudit: vi.fn().mockResolvedValue(undefined),
}));

import { dbMock } from "../helpers/db-mock";
import { recordAudit } from "@/lib/audit";
import { createSessionToken, verifySessionToken } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { resetRateLimitsForTesting } from "@/lib/rate-limit";
import { GET as devGet } from "@/app/api/auth/dev/route";
import { GET as logoutGet } from "@/app/api/auth/logout/route";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { GET as meGet } from "@/app/api/auth/me/route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  dbMock.reset();
  resetRateLimitsForTesting();
  vi.mocked(verifyPassword).mockResolvedValue(true);
});
afterEach(() => vi.unstubAllEnvs());

function cookiesOf(res: Response): string[] {
  return res.headers.getSetCookie();
}

function staffRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "staff-1",
    firstName: "Gerald",
    lastName: "M",
    role: "radiologist",
    specialization: "General Radiology",
    email: "gerald.m@gerald.co.bw",
    phone: "+267 71 100 108",
    passwordHash: "scrypt$16384$8$1$salt$key",
    status: "active",
    createdAt: new Date(),
    ...overrides,
  };
}

describe("GET /api/auth/dev", () => {
  it("is forbidden in production even with DEV_AUTH=true", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEV_AUTH", "true");

    const res = await devGet(new NextRequest("http://localhost/api/auth/dev"));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
    expect(createSessionToken).not.toHaveBeenCalled();
  });

  it("is forbidden when DEV_AUTH is not enabled", async () => {
    const res = await devGet(new NextRequest("http://localhost/api/auth/dev"));

    expect(res.status).toBe(403);
    expect(createSessionToken).not.toHaveBeenCalled();
  });

  it("redirects home with a session cookie when DEV_AUTH=true (development)", async () => {
    vi.stubEnv("DEV_AUTH", "true");
    vi.stubEnv("NODE_ENV", "development");

    const res = await devGet(new NextRequest("http://localhost/api/auth/dev"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/");
    expect(cookiesOf(res).join(";")).toContain("geraldos_session=session-token-123");
    expect(createSessionToken).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: "dev-admin",
        roles: ["administrator", "radiologist", "radiographer", "receptionist", "manager"],
      }),
    );
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "dev-admin",
        action: "auth.login",
        details: expect.objectContaining({ via: "dev" }),
      }),
    );
  });
});

describe("POST /api/auth/login — native staff authentication", () => {
  function loginRequest(body: unknown) {
    return new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("rejects missing credentials with 401 INVALID_CREDENTIALS", async () => {
    const res = await loginPost(loginRequest({}));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_CREDENTIALS");
    expect(createSessionToken).not.toHaveBeenCalled();
    expect(verifyPassword).not.toHaveBeenCalled();
  });

  it("rejects a wrong password with the same generic 401 and mints no session", async () => {
    vi.mocked(verifyPassword).mockResolvedValue(false);
    dbMock.result([staffRow()]);

    const res = await loginPost(loginRequest({ email: "gerald.m@gerald.co.bw", password: "wrong" }));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_CREDENTIALS");
    expect(verifyPassword).toHaveBeenCalledWith("wrong", staffRow().passwordHash);
    expect(createSessionToken).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("rejects an unknown email without leaking that it does not exist", async () => {
    dbMock.result([]);

    const res = await loginPost(loginRequest({ email: "nobody@gerald.co.bw", password: "x" }));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_CREDENTIALS");
    expect(verifyPassword).not.toHaveBeenCalled();
    expect(createSessionToken).not.toHaveBeenCalled();
  });

  it("rejects a staff member who has never been provisioned with a password hash", async () => {
    dbMock.result([staffRow({ passwordHash: null })]);

    const res = await loginPost(loginRequest({ email: "gerald.m@gerald.co.bw", password: "anything" }));

    expect(res.status).toBe(401);
    expect(verifyPassword).not.toHaveBeenCalled();
    expect(createSessionToken).not.toHaveBeenCalled();
  });

  it("issues a session cookie and audit entry on valid credentials", async () => {
    dbMock.result([staffRow()]);

    const res = await loginPost(
      loginRequest({ email: "GERALD.M@GERALD.CO.BW", password: "GeraldOS-Demo-2026!" }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.user).toEqual({
      sub: "staff-1",
      name: "Gerald M",
      email: "gerald.m@gerald.co.bw",
      roles: ["radiologist"],
      iss: "geraldos-native",
    });

    // Email was matched case-insensitively against the stored row.
    const selectCalls = dbMock.callsFor("select");
    expect(selectCalls.length).toBeGreaterThan(0);

    expect(createSessionToken).toHaveBeenCalledWith({
      sub: "staff-1",
      name: "Gerald M",
      email: "gerald.m@gerald.co.bw",
      roles: ["radiologist"],
      iss: "geraldos-native",
    });
    expect(cookiesOf(res).join(";")).toContain("geraldos_session=session-token-123");
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "staff-1",
        action: "auth.login",
        details: expect.objectContaining({ via: "native" }),
      }),
    );
  });
});

describe("GET /api/auth/me", () => {
  it("returns 401 when no session cookie is present", async () => {
    const res = await meGet(new NextRequest("http://localhost/api/auth/me"));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.authenticated).toBe(false);
  });

  it("returns the user when a valid session cookie is present", async () => {
    vi.mocked(verifySessionToken).mockResolvedValue({
      sub: "staff-1",
      name: "Gerald M",
      email: "gerald.m@gerald.co.bw",
      roles: ["radiologist"],
      iss: "geraldos-native",
    } as never);

    const res = await meGet(
      new NextRequest("http://localhost/api/auth/me", {
        headers: { cookie: "geraldos_session=valid-token" },
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authenticated).toBe(true);
    expect(body.user.roles).toContain("radiologist");
  });
});

describe("GET /api/auth/logout", () => {
  it("clears the session cookie and redirects to /login", async () => {
    const res = await logoutGet(
      new NextRequest("http://localhost/api/auth/logout", {
        headers: { cookie: "geraldos_session=session-token-123" },
      }),
    );

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/login?signed_out=1");
    const cookies = cookiesOf(res);
    expect(cookies.join(";")).toContain("geraldos_session=;");
  });

  it("redirects to the browser-facing origin on Render, not the container bind address", async () => {
    // Regression: `nextUrl.origin` behind Render's router is
    // `https://0.0.0.0:3000`, so logout used to send the browser to a
    // non-routable address and sign-out was effectively broken in production.
    const res = await logoutGet(
      new NextRequest("https://0.0.0.0:3000/api/auth/logout", {
        headers: {
          cookie: "geraldos_session=session-token-123",
          host: "geraldos-radiology.onrender.com",
          "x-forwarded-proto": "https",
        },
      }),
    );

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://geraldos-radiology.onrender.com/login?signed_out=1",
    );
    expect(res.headers.get("location")).not.toContain("0.0.0.0");
  });
});
