import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * Lazy database singleton.
 *
 * The connection is created on first access so that `next build` (which
 * imports API routes for page-data collection) never triggers a missing-
 * DATABASE_URL throw.  The throw is deferred to actual request time.
 */

let _pool: Pool | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

function ensureInitialized() {
  if (_db) return;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "[GeraldOS] DATABASE_URL is required. " +
        "Set it in your production environment before starting the server."
    );
  }

  const globalForDb = globalThis as typeof globalThis & {
    __arenaNextJsPostgresqlPool?: Pool;
  };

  _pool = globalForDb.__arenaNextJsPostgresqlPool ?? new Pool({ connectionString: databaseUrl });

  if (process.env.NODE_ENV !== "production") {
    globalForDb.__arenaNextJsPostgresqlPool = _pool;
  }

  _db = drizzle(_pool);
}

/**
 * Proxy-based exports that look like direct `pool` / `db` references but
 * lazily initialize on first property access — compatible with every
 * consumer that does `import { db } from "@/db"` or `pool.query(...)`.
 */

export const pool: Pool = new Proxy({} as Pool, {
  get(_, prop, receiver) {
    ensureInitialized();
    const target = _pool!;
    const value = Reflect.get(target, prop, receiver);
    return typeof value === "function" ? value.bind(target) : value;
  },
});

export const db: ReturnType<typeof drizzle> = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_, prop, receiver) {
    ensureInitialized();
    const target = _db!;
    const value = Reflect.get(target, prop, receiver);
    return typeof value === "function" ? value.bind(target) : value;
  },
});
