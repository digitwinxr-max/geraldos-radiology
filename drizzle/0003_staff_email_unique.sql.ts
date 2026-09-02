import { pgTable } from "drizzle-orm/pg-core";

/**
 * GeraldOS — 0003: staff email uniqueness.
 *
 * Enforces a unique constraint on `staff.email`. Staff email is the identity
 * key for native authentication (case-insensitive lookup), and the constraint
 * makes administrator bootstrap idempotent (no duplicate admins on rerun).
 *
 * A UNIQUE INDEX is used rather than a table constraint so the migration is a
 * single, idempotent statement that can run safely against existing rows
 * (PostgreSQL NULLs remain distinct, so staff without an email are untouched).
 */

export default {
  up: (db: any) => `
    CREATE UNIQUE INDEX IF NOT EXISTS staff_email_unique ON staff (email);
  `,
  down: (db: any) => `
    DROP INDEX IF EXISTS staff_email_unique;
  `,
};
