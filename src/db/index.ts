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
 * Managed PostgreSQL (e.g. Render) requires TLS. The driver honors
 * `?sslmode=` in the URL and enables TLS when set to `require`/`verify-full`,
 * but Render's internal certificate cannot be validated from a public client,
 * so we relax peer verification. If the URL explicitly disables TLS
 * (`sslmode=disable`), we leave `ssl` unset to respect that intent.
 */
function resolveSsl(databaseUrl: string): { rejectUnauthorized: false } | undefined {
  const sslmode = new URL(databaseUrl).searchParams.get("sslmode");
  if (sslmode === "disable") return undefined;
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
