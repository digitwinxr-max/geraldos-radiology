/**
 * GeraldOS — Environment Validation
 *
 * Fail-fast in production when required secrets are missing or insecure.
 * In development the known fallback values remain available with a warning.
 */

const DEV_SECRET = "geraldos-dev-secret-change-me";

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Resolve an environment variable with an optional fallback.
 * In production, throws when the variable is missing or equals the known
 * insecure dev default.
 */
function resolveEnv(name: string, fallback?: string): string {
  const raw = process.env[name];
  // An explicitly blank variable ("") is treated as unset so deployments that
  // blank out a value still receive the documented fallback instead of
  // silently disabling security defaults.
  const isBlank = raw === undefined || raw === "";

  if (isProduction()) {
    // In production the dev fallback must never silently apply — a blank or
    // missing required variable is always fatal.
    if (isBlank) {
      throw new Error(
        `[GeraldOS] Missing required environment variable ${name}. ` +
          "Set it in your production environment before starting the server."
      );
    }
    if (name === "AUTH_SECRET" && raw === DEV_SECRET) {
      throw new Error(
        `[GeraldOS] AUTH_SECRET is set to the known development default. ` +
          "Generate a secure random secret (≥32 bytes) for production."
      );
    }
    return raw;
  }

  const value = !isBlank ? raw : (fallback ?? "");
  if (!value) {
    console.warn(
      `[GeraldOS] ${name} is not set — using empty string. ` +
        "This is acceptable in development only."
    );
  }
  return value;
}

/**
 * Require a production secret. Throws in production when the variable is
 * missing or matches the dev default. Returns the value in development.
 */
export function requireProductionSecret(name: string): string {
  return resolveEnv(name);
}

// ─── Resolved environment values ───

export const env = {
  get nodeEnv(): string {
    return process.env.NODE_ENV ?? "development";
  },
  get isProduction(): boolean {
    return isProduction();
  },
  /** Opt-in dev administrator sign-in (development only; see /api/auth/dev). */
  get devAuthEnabled(): boolean {
    return process.env.DEV_AUTH === "true";
  },
  get databaseUrl(): string {
    return resolveEnv("DATABASE_URL");
  },
  get authSecret(): string {
    return resolveEnv("AUTH_SECRET", DEV_SECRET);
  },
  /** Browser-facing public origin for this app (e.g. https://app.example.com). */
  get publicAppUrl(): string {
    return (process.env.PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  },
} as const;
