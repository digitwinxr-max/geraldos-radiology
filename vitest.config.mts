import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
    // pg (node-postgres) is server-only; mock @/db in tests that touch the bus.
    testTimeout: 10_000,
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/lib/**", "src/services/**"],
      thresholds: {
        statements: 40,
        branches: 40,
        functions: 35,
        lines: 40,
      },
    },
  },
});
