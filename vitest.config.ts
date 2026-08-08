import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
    // pg (node-postgres) is server-only; mock @/db in tests that touch the bus.
    testTimeout: 10_000,
  },
});
