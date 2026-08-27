/**
 * Gate 1 — production secret enforcement.
 *
 * `env` getters must fail fast in production when required secrets are missing
 * or set to the known insecure dev default, and stay permissive in development.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { env } from "@/lib/env";

const DEV_SECRET = "geraldos-dev-secret-change-me";

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("AUTH_SECRET", "");
  vi.stubEnv("KEYCLOAK_URL", "");
  vi.stubEnv("KEYCLOAK_CLIENT_SECRET", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("production — fail fast on missing or insecure secrets", () => {
  beforeEach(() => vi.stubEnv("NODE_ENV", "production"));

  it("throws when DATABASE_URL is missing", () => {
    expect(() => env.databaseUrl).toThrow(/Missing required environment variable DATABASE_URL/);
  });

  it("throws when AUTH_SECRET is missing", () => {
    expect(() => env.authSecret).toThrow(/Missing required environment variable AUTH_SECRET/);
  });

  it("throws when AUTH_SECRET equals the dev default", () => {
    vi.stubEnv("AUTH_SECRET", DEV_SECRET);

    expect(() => env.authSecret).toThrow(/known development default/);
  });

  it("accepts a properly set production secret", () => {
    vi.stubEnv("DATABASE_URL", "postgres://prod:5432/geraldos");
    vi.stubEnv("AUTH_SECRET", "c2VjdXJlLXJhbmRvbS1wcm9kdWN0aW9uLXNlY3JldA");

    expect(env.databaseUrl).toBe("postgres://prod:5432/geraldos");
    expect(env.authSecret).toBe("c2VjdXJlLXJhbmRvbS1wcm9kdWN0aW9uLXNlY3JldA");
  });

  it("enforces KEYCLOAK_CLIENT_SECRET only when Keycloak is configured", () => {
    vi.stubEnv("KEYCLOAK_URL", "http://keycloak:8080");

    expect(() => env.keycloakClientSecret).toThrow(
      /Missing required environment variable KEYCLOAK_CLIENT_SECRET/,
    );

    vi.stubEnv("KEYCLOAK_CLIENT_SECRET", "kc-secret");
    expect(env.keycloakClientSecret).toBe("kc-secret");
  });

  it("flags production mode", () => {
    expect(env.isProduction).toBe(true);
  });
});

describe("development — permissive fallbacks", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("falls back to the dev secret without throwing", () => {
    expect(env.authSecret).toBe(DEV_SECRET);
  });

  it("returns an empty database URL without throwing", () => {
    expect(env.databaseUrl).toBe("");
  });

  it("never enforces KEYCLOAK_CLIENT_SECRET while Keycloak is unconfigured", () => {
    expect(env.keycloakClientSecret).toBe("");
  });
});

describe("dev auth opt-in flag", () => {
  it("is disabled unless DEV_AUTH=true", () => {
    expect(env.devAuthEnabled).toBe(false);

    vi.stubEnv("DEV_AUTH", "1");
    expect(env.devAuthEnabled).toBe(false);

    vi.stubEnv("DEV_AUTH", "true");
    expect(env.devAuthEnabled).toBe(true);
  });
});
