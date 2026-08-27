import type { Config } from "drizzle-kit";

/**
 * GeraldOS — Drizzle Kit configuration.
 *
 * DATABASE_URL drives the target so the same command works against local
 * development, the integration stack (docker-compose.integration.yml, port
 * 55432) and CI. Falls back to the compose-network default.
 */
export default {
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://geraldos_admin:geraldos_secure_pass@127.0.0.1:5432/geraldos",
  },
} satisfies Config;
