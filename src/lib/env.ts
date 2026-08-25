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
  const value = process.env[name] ?? fallback ?? "";

  if (isProduction()) {
    if (!value) {
      throw new Error(
        `[GeraldOS] Missing required environment variable ${name}. ` +
          "Set it in your production environment before starting the server."
      );
    }
    if (name === "AUTH_SECRET" && value === DEV_SECRET) {
      throw new Error(
        `[GeraldOS] AUTH_SECRET is set to the known development default. ` +
          "Generate a secure random secret (≥32 bytes) for production."
      );
    }
  }

  if (!value && !isProduction()) {
    console.warn(
      `[GeraldOS] ${name} is not set — using ${fallback ? "fallback" : "empty string"}. ` +
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
  get databaseUrl(): string {
    return resolveEnv("DATABASE_URL");
  },
  get authSecret(): string {
    return resolveEnv("AUTH_SECRET", DEV_SECRET);
  },
  get keycloakUrl(): string {
    return process.env.KEYCLOAK_URL ?? "";
  },
  get keycloakClientSecret(): string {
    // Only enforced when Keycloak is configured
    if (process.env.KEYCLOAK_URL) {
      return resolveEnv("KEYCLOAK_CLIENT_SECRET");
    }
    return process.env.KEYCLOAK_CLIENT_SECRET ?? "";
  },
} as const;
