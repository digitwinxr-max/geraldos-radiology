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

/**
 * Derive the node-postgres `ssl` option from the connection string.
 *
 * When `sslmode` is absent (the common Render configuration) TLS is enabled
 * with `rejectUnauthorized: false`, which is Render-compatible because the
 * managed tier uses a proxy certificate that a public client cannot validate.
 *
 * When `sslmode` is present the URL is authoritative: node-postgres maps
 * `require`/`verify-ca`/`verify-full` to TLS with full verification and
 * `disable` to no TLS. We must not pass our own `ssl` option in that case —
 * doing so would silently downgrade a stricter mode. We never weaken TLS when
 * the connection string explicitly requests certificate verification.
 */
export function resolveSsl(databaseUrl: string): { rejectUnauthorized: false } | undefined {
  const sslmode = new URL(databaseUrl).searchParams.get("sslmode");
  if (sslmode !== null) return undefined;
  return { rejectUnauthorized: false };
}

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

  const ssl = resolveSsl(databaseUrl);
  _pool =
    globalForDb.__arenaNextJsPostgresqlPool ??
    new Pool({ connectionString: databaseUrl, ssl });

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
