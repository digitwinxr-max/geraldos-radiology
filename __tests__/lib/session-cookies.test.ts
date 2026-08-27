/**
 * Gate 1 — session cookie and token lifecycle tests.
 *
 * Secure cookie flags, JWT round-trip integrity and expiry enforcement are the
 * substrate every other auth control depends on.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createSessionToken,
  secureCookieOptions,
  SESSION_COOKIE,
  verifySessionToken,
  type SessionUser,
} from "@/lib/auth/session";

const user: SessionUser = {
  sub: "session-user",
  name: "Session User",
  email: "session@gerald.co.za",
  roles: ["radiologist"],
  iss: "geraldos-test",
};

beforeEach(() => vi.unstubAllEnvs());
afterEach(() => vi.unstubAllEnvs());

describe("secureCookieOptions", () => {
  it("sets secure only in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(secureCookieOptions().secure).toBe(true);

    vi.stubEnv("NODE_ENV", "development");
    expect(secureCookieOptions().secure).toBe(false);
  });

  it("is always httpOnly with SameSite=Lax and an 8h default lifetime", () => {
    const options = secureCookieOptions();
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
    expect(options.maxAge).toBe(60 * 60 * 8);
  });

  it("honours a custom lifetime", () => {
    expect(secureCookieOptions(60).maxAge).toBe(60);
  });

  it("uses the canonical session cookie name", () => {
    expect(SESSION_COOKIE).toBe("geraldos_session");
  });
});

describe("session token round-trip", () => {
  it("verifies a freshly created token and recovers the user claims", async () => {
    const token = await createSessionToken(user);
    const verified = await verifySessionToken(token);

    expect(verified).not.toBeNull();
    expect(verified).toEqual({
      sub: user.sub,
      name: user.name,
      email: user.email,
      roles: user.roles,
      iss: user.iss,
    });
  });

  it("rejects a tampered token", async () => {
    const token = await createSessionToken(user);
    const tampered = token.slice(0, -4) + "AAAA";

    expect(await verifySessionToken(tampered)).toBeNull();
  });

  it("rejects garbage input", async () => {
    expect(await verifySessionToken("not-a-jwt")).toBeNull();
    expect(await verifySessionToken("")).toBeNull();
  });

  it("rejects an expired token", async () => {
    const expired = await createSessionToken(user, -5);

    expect(await verifySessionToken(expired)).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await createSessionToken(user);

    vi.stubEnv("AUTH_SECRET", "a-completely-different-secret-0123456789");
    expect(await verifySessionToken(token)).toBeNull();
  });
});
