import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/session", () => ({
  SESSION_COOKIE: "geraldos_session",
  secureCookieOptions: vi.fn(() => ({ httpOnly: true, sameSite: "lax", path: "/" })),
  createSessionToken: vi.fn().mockResolvedValue("session-token-123"),
}));
vi.mock("@/lib/auth/oidc", () => ({
  keycloakConfigured: vi.fn(),
  discoverOidc: vi.fn(),
  buildAuthorizationUrl: vi.fn(
    (_oidc: unknown, redirectUri: string, state: string): string =>
      `https://keycloak.example/authorize?redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`,
  ),
  exchangeCodeForTokens: vi.fn(),
  verifyIdToken: vi.fn(),
  verifyAccessTokenRoles: vi.fn(),
  extractRoles: vi.fn(),
}));
vi.mock("@/lib/auth/origin", () => ({
  publicAppOrigin: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({
  recordAudit: vi.fn().mockResolvedValue(undefined),
}));

import { recordAudit } from "@/lib/audit";
import { createSessionToken } from "@/lib/auth/session";
import { resetRateLimitsForTesting } from "@/lib/rate-limit";
import {
  discoverOidc,
  exchangeCodeForTokens,
  extractRoles,
  keycloakConfigured,
  verifyAccessTokenRoles,
  verifyIdToken,
} from "@/lib/auth/oidc";
import { publicAppOrigin } from "@/lib/auth/origin";
import { GET as devGet } from "@/app/api/auth/dev/route";
import { GET as callbackGet } from "@/app/api/auth/callback/route";
import { GET as loginGet } from "@/app/api/auth/login/route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  resetRateLimitsForTesting();
  // Default: no PUBLIC_APP_URL → routes fall back to the request origin.
  vi.mocked(publicAppOrigin).mockImplementation((req) => req.nextUrl.origin);
});
afterEach(() => vi.unstubAllEnvs());

function cookiesOf(res: Response): string[] {
  return res.headers.getSetCookie();
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

  it("is forbidden when Keycloak is configured and DEV_AUTH is not set", async () => {
    vi.mocked(keycloakConfigured).mockReturnValue(true);

    const res = await devGet(new NextRequest("http://localhost/api/auth/dev"));

    expect(res.status).toBe(403);
  });

  it("redirects home with a session cookie when Keycloak is unconfigured", async () => {
    vi.mocked(keycloakConfigured).mockReturnValue(false);

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

  it("DEV_AUTH=true overrides a configured Keycloak", async () => {
    vi.mocked(keycloakConfigured).mockReturnValue(true);
    vi.stubEnv("DEV_AUTH", "true");

    const res = await devGet(new NextRequest("http://localhost/api/auth/dev"));

    expect(res.status).toBe(307);
  });
});

describe("GET /api/auth/login — public origin handling", () => {
  function loginRequest(url: string) {
    return new NextRequest(url);
  }

  it("uses PUBLIC_APP_URL for the OAuth redirect_uri when configured", async () => {
    vi.mocked(keycloakConfigured).mockReturnValue(true);
    vi.mocked(discoverOidc).mockResolvedValue({} as never);
    vi.mocked(publicAppOrigin).mockReturnValue("https://geraldos-radiology.onrender.com");

    const res = await loginGet(
      loginRequest("https://0.0.0.0:10000/api/auth/login"),
    );

    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain(
      "redirect_uri=https%3A%2F%2Fgeraldos-radiology.onrender.com%2Fapi%2Fauth%2Fcallback",
    );
    // The internal/container origin must never leak into the authorization request.
    expect(location).not.toContain("0.0.0.0");
    expect(location).not.toContain("10000");
  });

  it("does not use the internal container origin when PUBLIC_APP_URL is configured", async () => {
    vi.mocked(keycloakConfigured).mockReturnValue(true);
    vi.mocked(discoverOidc).mockResolvedValue({} as never);
    vi.mocked(publicAppOrigin).mockReturnValue("https://geraldos-radiology.onrender.com");

    const res = await loginGet(
      loginRequest("http://0.0.0.0:10000/api/auth/login"),
    );

    const location = res.headers.get("location") ?? "";
    expect(location).toContain(
      "redirect_uri=https%3A%2F%2Fgeraldos-radiology.onrender.com%2Fapi%2Fauth%2Fcallback",
    );
    expect(location).not.toMatch(/0\.0\.0\.0|localhost|127\.0\.0\.1/);
  });

  it("falls back to the request origin when PUBLIC_APP_URL is absent (dev behaviour)", async () => {
    vi.mocked(keycloakConfigured).mockReturnValue(true);
    vi.mocked(discoverOidc).mockResolvedValue({} as never);

    const res = await loginGet(
      loginRequest("http://localhost:3000/api/auth/login"),
    );

    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain(
      "redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fauth%2Fcallback",
    );
    expect(location).toContain("state=");
  });

  it("sets the oauth state cookie and preserves CSRF/state protection", async () => {
    vi.mocked(keycloakConfigured).mockReturnValue(true);
    vi.mocked(discoverOidc).mockResolvedValue({} as never);
    vi.mocked(publicAppOrigin).mockReturnValue("https://geraldos-radiology.onrender.com");

    const res = await loginGet(
      loginRequest("http://localhost:3000/api/auth/login"),
    );

    const cookies = cookiesOf(res);
    const stateCookie = cookies.find((c) => c.startsWith("geraldos_oauth_state="));
    expect(stateCookie).toBeDefined();
    expect(stateCookie).toContain("HttpOnly");
    expect(stateCookie).toContain("SameSite=lax");
  });
});

describe("GET /api/auth/callback", () => {
  function callbackRequest(qs: string, cookie?: string) {
    return new NextRequest(`http://localhost/api/auth/callback${qs}`, {
      headers: cookie ? { cookie } : {},
    });
  }

  it("redirects with invalid_oauth_state when code or state is missing", async () => {
    const res = await callbackGet(callbackRequest("?state=abc", "geraldos_oauth_state=abc"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/login?error=invalid_oauth_state");
    expect(discoverOidc).not.toHaveBeenCalled();
  });

  it("redirects with invalid_oauth_state when the state cookie does not match", async () => {
    const res = await callbackGet(
      callbackRequest("?code=auth-code&state=abc", "geraldos_oauth_state=other"),
    );

    expect(res.headers.get("location")).toBe("http://localhost/login?error=invalid_oauth_state");
  });

  it("redirects with invalid_oauth_state when the state cookie is absent", async () => {
    const res = await callbackGet(callbackRequest("?code=auth-code&state=abc"));

    expect(res.headers.get("location")).toBe("http://localhost/login?error=invalid_oauth_state");
  });

  it("exchanges the code, sets the session cookie and deletes the state cookie", async () => {
    const oidc = { token_endpoint: "https://kc/token" };
    vi.mocked(discoverOidc).mockResolvedValue(oidc as never);
    vi.mocked(exchangeCodeForTokens).mockResolvedValue({
      id_token: "id-token",
      access_token: "access-token",
    } as never);
    // Real-world Keycloak: realm roles ride ONLY on the access token.
    vi.mocked(verifyIdToken).mockResolvedValue({
      sub: "kc-1",
      name: "Keycloak User",
      email: "user@gerald.co.za",
    } as never);
    vi.mocked(extractRoles).mockReturnValue([]);
    vi.mocked(verifyAccessTokenRoles).mockResolvedValue(["radiologist"]);

    const res = await callbackGet(
      callbackRequest("?code=auth-code&state=abc", "geraldos_oauth_state=abc"),
    );

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/");
    expect(exchangeCodeForTokens).toHaveBeenCalledWith(
      oidc,
      "auth-code",
      "http://localhost/api/auth/callback",
    );
    expect(createSessionToken).toHaveBeenCalledWith(
      expect.objectContaining({ sub: "kc-1", roles: ["radiologist"], iss: "keycloak" }),
    );
    // Roles must be sourced from the verified ACCESS token, not just the ID token.
    expect(verifyAccessTokenRoles).toHaveBeenCalledWith(oidc, "access-token");

    const cookies = cookiesOf(res);
    expect(cookies.join(";")).toContain("geraldos_session=session-token-123");
    const deleted = cookies.find((c) => c.startsWith("geraldos_oauth_state="));
    expect(deleted).toBeDefined();
    // Deleted cookies are blanked with an epoch expiry.
    expect(deleted).toContain("geraldos_oauth_state=;");
    expect(deleted).toMatch(/Expires=Thu, 01 Jan 1970/i);

    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "kc-1",
        action: "auth.login",
        details: expect.objectContaining({ via: "keycloak", roles: ["radiologist"] }),
      }),
    );
  });

  it("redirects with a URL-encoded error when the token exchange fails", async () => {
    vi.mocked(discoverOidc).mockResolvedValue({} as never);
    vi.mocked(exchangeCodeForTokens).mockRejectedValue(new Error("invalid grant"));

    const res = await callbackGet(
      callbackRequest("?code=bad-code&state=abc", "geraldos_oauth_state=abc"),
    );

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/login?error=invalid%20grant");
    expect(createSessionToken).not.toHaveBeenCalled();
  });

  it("uses the configured public origin for the token-exchange redirect_uri", async () => {
    const oidc = { token_endpoint: "https://kc/token" };
    vi.mocked(discoverOidc).mockResolvedValue(oidc as never);
    vi.mocked(exchangeCodeForTokens).mockResolvedValue({
      id_token: "id-token",
      access_token: "access-token",
    } as never);
    vi.mocked(verifyIdToken).mockResolvedValue({ sub: "kc-1" } as never);
    vi.mocked(extractRoles).mockReturnValue([]);
    vi.mocked(verifyAccessTokenRoles).mockResolvedValue([]);
    vi.mocked(publicAppOrigin).mockReturnValue("https://geraldos-radiology.onrender.com");

    const res = await callbackGet(
      callbackRequest("?code=ok-code&state=abc", "geraldos_oauth_state=abc"),
    );

    expect(exchangeCodeForTokens).toHaveBeenCalledWith(
      oidc,
      "ok-code",
      "https://geraldos-radiology.onrender.com/api/auth/callback",
    );
    // Post-login redirect targets the public origin, not the internal one.
    expect(res.headers.get("location")).toBe("https://geraldos-radiology.onrender.com/");
  });
});
