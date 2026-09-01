/**
 * GeraldOS — Native authentication
 *
 * Authenticates staff against PostgreSQL staff records using scrypt password
 * hashes (src/lib/auth/password.ts). On success it returns a SessionUser whose
 * roles are derived from the staff member's role — the same shape the existing
 * HS256 session layer already understands, so RBAC and the edge proxy are
 * unchanged.
 *
 * Fail-closed by design: any unknown email, missing hash or wrong password
 * yields the same generic 401 so login does not leak which emails exist.
 */

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { staff } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import type { SessionUser } from "@/lib/auth/session";

export type NativeAuthResult =
  | { ok: true; user: SessionUser }
  | { ok: false; status: 401; error: string };

/**
 * Authenticate a staff member by email + password against the staff table.
 * Emails are matched case-insensitively; the session issuer is
 * "geraldos-native" so audit trails distinguish native logins from dev/admin.
 */
export async function authenticateStaff(
  email: string,
  password: string,
): Promise<NativeAuthResult> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !password) {
    return { ok: false, status: 401, error: "Invalid email or password" };
  }

  let row: typeof staff.$inferSelect | undefined;
  try {
    [row] = await db
      .select()
      .from(staff)
      .where(sql`lower(${staff.email}) = ${normalized}`)
      .limit(1);
  } catch {
    return { ok: false, status: 401, error: "Invalid email or password" };
  }

  if (!row || !row.passwordHash) {
    return { ok: false, status: 401, error: "Invalid email or password" };
  }

  const valid = await verifyPassword(password, row.passwordHash);
  if (!valid) {
    return { ok: false, status: 401, error: "Invalid email or password" };
  }

  return {
    ok: true,
    user: {
      sub: row.id,
      name: `${row.firstName} ${row.lastName}`.trim(),
      email: row.email ?? undefined,
      roles: [row.role],
      iss: "geraldos-native",
    },
  };
}
