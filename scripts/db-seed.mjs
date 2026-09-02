#!/usr/bin/env node
/**
 * GeraldOS — Database runner (deployment entry point).
 *
 *   node scripts/db-seed.mjs migrate          # apply Drizzle migrations
 *   node scripts/db-seed.mjs seed             # seed demo data (dev/demo DBs only)
 *   node scripts/db-seed.mjs all              # migrate + seed
 *   node scripts/db-seed.mjs bootstrap-admin  # create/refresh the production administrator
 *
 * The `seed` command refuses to run with NODE_ENV=production (parity with the
 * /api/seed route guard) so a production database can never be wiped by this
 * script.
 *
 * `bootstrap-admin` reads ADMIN_EMAIL + ADMIN_PASSWORD from the environment
 * (never CLI args, never logs them), validates the password length, hashes
 * with the native-auth scrypt parameters, and upserts a single
 * role=administrator, status=active staff row. It is idempotent: re-running
 * with the same email refreshes the SAME row (guarded by the unique email
 * index added in migration 0003).
 */

import { execFileSync } from "node:child_process";
import { bootstrapAdmin } from "./lib/admin-bootstrap.mjs";

const command = process.argv[2] ?? "all";

function run(cmd, args) {
  console.log(`> ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { stdio: "inherit" });
}

function runDrizzleKit(args) {
  // Prefer the local binary (present in the runtime image) so `migrate` never
  // depends on npx reaching the network; fall back to npx outside the image.
  const local = new URL("../node_modules/.bin/drizzle-kit", import.meta.url).pathname;
  try {
    execFileSync(local, args, { stdio: "inherit" });
  } catch (error) {
    if (error?.code === "ENOENT") run("npx", ["drizzle-kit", ...args]);
    else throw error;
  }
}

async function main() {
  if (command === "migrate" || command === "all") {
    runDrizzleKit(["migrate"]);
  }

  if (command === "seed" || command === "all") {
    if (process.env.NODE_ENV === "production") {
      console.error("Refusing to seed in NODE_ENV=production — run this only against dev/demo databases.");
      process.exit(1);
    }
    // The seed route is HTTP-only; call the shared seeding logic through the app
    // build (see src/app/api/seed/route.ts). Use the dev server URL when running
    // locally, or set SEED_URL to the deployed app's public URL.
    const seedUrl = process.env.SEED_URL ?? "http://localhost:3000";
    run("curl", ["-fsS", "-X", "POST", `${seedUrl}/api/seed`]);
  }

  if (command === "bootstrap-admin") {
    const databaseUrl = process.env.DATABASE_URL;
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;

    if (!databaseUrl) {
      console.error("bootstrap-admin requires DATABASE_URL (environment).");
      process.exit(1);
    }
    if (!email || !password) {
      console.error("bootstrap-admin requires ADMIN_EMAIL and ADMIN_PASSWORD (environment).");
      process.exit(1);
    }

    try {
      const result = await bootstrapAdmin({ databaseUrl, email, password });
      console.log(
        `bootstrap-admin: ${result.created ? "created" : "refreshed"} administrator ` +
          `${result.email} (id=${result.id}, role=${result.role}, status=${result.status})`,
      );
    } catch (error) {
      console.error(`bootstrap-admin failed: ${error?.message ?? error}`);
      process.exit(1);
    }
  }

  if (!["migrate", "seed", "all", "bootstrap-admin"].includes(command)) {
    console.error(
      `Unknown command "${command}". Usage: node scripts/db-seed.mjs migrate|seed|all|bootstrap-admin`,
    );
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exit(1);
});
