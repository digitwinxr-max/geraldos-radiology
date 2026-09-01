/**
 * GeraldOS — Admin bootstrap (shared logic)
 *
 * Single path that creates/refreshes the first production administrator.
 * Used by `scripts/db-seed.mjs bootstrap-admin` (CLI) and by the Render
 * pre-deploy hook. Written in plain ESM over `pg` + `node:crypto` so it runs
 * inside the lean runtime image without TypeScript compilation or
 * development tooling.
 *
 * Security properties:
 *  - Credentials come from environment variables only (never CLI args, so
 *    they are not visible in process listings); never logged.
 *  - Passwords are hashed with the SAME scrypt parameters/format as native
 *    authentication (src/lib/auth/password.ts): N=16384, r=8, p=1, 64-byte
 *    derived key, random 16-byte salt, stored `scrypt$N$r$p$salt$key`,
 *    verified with timing-safe comparison. Plaintext is never stored.
 *  - The staff row is upserted by the UNIQUE email index added in migration
 *    0003 (staff_email_unique): repeated runs update the SAME row, so no
 *    duplicate administrators are ever created.
 *  - Fail-closed: missing or weak credentials abort with a non-zero exit
 *    before any database write.
 */

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { Client as PgClient } from "pg";

// `pg` is injected so tests can substitute a fake client and no real database
// connection is ever opened by the module itself.
export function createPgClient(connectionString) {
  return new PgClient({ connectionString });
}

// Must stay in lockstep with src/lib/auth/password.ts (native auth).
export const SCRYPT_N = 16384;
export const SCRYPT_R = 8;
export const SCRYPT_P = 1;
export const SCRYPT_KEY_LENGTH = 64;
export const SCRYPT_SALT_LENGTH = 16;
export const PASSWORD_MIN_LENGTH = 12;
export const ADMIN_ROLE = "administrator";

export function hashPasswordScrypt(password) {
  const salt = randomBytes(SCRYPT_SALT_LENGTH);
  const key = scryptSync(password, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("hex")}$${key.toString("hex")}`;
}

export function verifyPasswordScrypt(password, stored) {
  if (typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltHex, keyHex] = parts;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(keyHex, "hex");
  if (salt.length === 0 || expected.length === 0) return false;
  const actual = scryptSync(password, salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return timingSafeEqual(actual, expected);
}

/** Validate credentials; returns an error message or null. Never echoes secrets. */
export function validateAdminCredentials(email, password) {
  if (typeof email !== "string" || !email.trim() || !email.includes("@")) {
    return "ADMIN_EMAIL must be a valid email address";
  }
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
    return `ADMIN_PASSWORD must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  return null;
}

/**
 * Bootstrap (or refresh) the administrator.
 *
 * @param {{ databaseUrl?: string, client?: {connect: Function, query: Function, end: Function}, email: string, password: string }} opts
 * @returns {{ id: string, email: string, role: string, status: string, created: boolean }}
 */
export async function bootstrapAdmin({ databaseUrl, client: injectedClient, email, password }) {
  const normalized = email.trim().toLowerCase();
  const problem = validateAdminCredentials(normalized, password);
  if (problem) {
    const err = new Error(problem);
    err.code = "INVALID_CREDENTIALS";
    throw err;
  }

  const passwordHash = hashPasswordScrypt(password);
  const client = injectedClient ?? createPgClient(databaseUrl);
  const ownsConnection = !injectedClient;
  if (ownsConnection) await client.connect();
  try {
    // Case-insensitive uniqueness: the 0003 unique index guards exact
    // duplicates; for case variants we resolve the existing row by
    // lower(email) first, then upsert on the stable primary key.
    const existing = await client.query(
      `SELECT id, email FROM staff WHERE lower(email) = $1 LIMIT 1`,
      [normalized],
    );
    const values = [
      normalized,
      "Administrator",
      ADMIN_ROLE,
      null,
      normalized,
      passwordHash,
      "active",
    ];
    let created = false;
    let id;
    if (existing.rowCount > 0) {
      const row = existing.rows[0];
      id = row.id;
      await client.query(
        `UPDATE staff SET
            first_name = $1, last_name = $2, role = $3, specialization = $4,
            email = $5, password_hash = $6, status = $7
         WHERE id = $8`,
        [...values, id],
      );
    } else {
      created = true;
      const inserted = await client.query(
        `INSERT INTO staff (first_name, last_name, role, specialization, email, password_hash, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        values,
      );
      id = inserted.rows[0].id;
    }
    return { id, email: normalized, role: ADMIN_ROLE, status: "active", created };
  } finally {
    if (ownsConnection) await client.end().catch(() => {});
  }
}
