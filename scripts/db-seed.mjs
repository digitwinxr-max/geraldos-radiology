#!/usr/bin/env node
/**
 * GeraldOS — Database migration + demo seed runner (deployment entry point).
 *
 *   node scripts/db-seed.mjs migrate   # apply Drizzle migrations
 *   node scripts/db-seed.mjs seed      # seed demo data (dev/demo DBs only)
 *   node scripts/db-seed.mjs all       # migrate + seed
 *
 * The `seed` command refuses to run with NODE_ENV=production (parity with the
 * /api/seed route guard) so a production database can never be wiped by this
 * script.
 */
import { execFileSync } from "node:child_process";

const command = process.argv[2] ?? "all";

function run(cmd, args) {
  console.log(`> ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { stdio: "inherit" });
}

if (command === "migrate" || command === "all") {
  run("npx", ["drizzle-kit", "migrate"]);
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
