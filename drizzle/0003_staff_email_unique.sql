-- GeraldOS — 0003: staff email uniqueness.
--
-- Staff email is the identity key for native authentication
-- (src/lib/auth/native-auth.ts performs case-insensitive email lookup).
-- A unique constraint on email prevents duplicate-identity drift and makes
-- the admin bootstrap idempotent.
--
-- PostgreSQL treats NULL as distinct, so staff rows without an email are
-- unaffected by this constraint.

CREATE UNIQUE INDEX IF NOT EXISTS staff_email_unique ON staff (email);
