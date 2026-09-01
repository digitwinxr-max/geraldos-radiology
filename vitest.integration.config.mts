/**
 * GeraldOS — Integration test configuration.
 *
 * Runs against LIVE infrastructure (docker-compose.integration.yml) and the
 * production server build. Separate from the unit pipeline on purpose:
 * unit tests must stay fast, deterministic and container-free.
 *
 *   docker compose -f docker-compose.integration.yml up -d
 *   npm run db:push && npm run build && npm run start   (integration env)
 *   npm run test:integration
 */

import { defineConfig } from "vitest/config";
import path from "node:path";
import { existsSync } from "node:fs";

// Load the integration environment (compose ports + credentials) using the
// Node built-in loader — no dotenv dependency in the lean stack.
const envFile = path.resolve(import.meta.dirname, ".env.integration");
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  test: {
    environment: "node",
    include: ["__integration__/**/*.test.ts"],
    // Full OIDC browser-flow simulation is inherently slow; the login helper's
    // 429 backoff (rate-limit respectful) can stretch a beforeAll past a minute.
    testTimeout: 60_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
});
