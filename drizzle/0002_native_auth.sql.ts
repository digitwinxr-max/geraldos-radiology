import { pgTable } from "drizzle-orm/pg-core";

/**
 * GeraldOS — 0002: Native authentication.
 *
 * Adds the `password_hash` column to `staff` for scrypt-hashed credentials
 * (native auth), and simplifies the `event_log` bookkeeping columns that were
 * only meaningful for the removed Redis fan-out relay.
 *
 * Notes:
 *  - The partial index `event_log_pending_idx` is dropped because the pending
 *    Redis relay no longer exists.
 *  - Existing rows keep their values; `published_at` is preserved for audit
 *    history and may be NULL only for rows inserted before this migration.
 */

export default {
  up: (db: any) => `
    ALTER TABLE staff ADD COLUMN IF NOT EXISTS password_hash text;

    DROP INDEX IF EXISTS event_log_pending_idx;
    ALTER TABLE event_log
      ALTER COLUMN publish_attempts DROP DEFAULT,
      ALTER COLUMN publish_attempts DROP NOT NULL,
      ALTER COLUMN last_publish_error DROP NOT NULL;
  `,
  down: (db: any) => `
    ALTER TABLE staff DROP COLUMN IF EXISTS password_hash;

    CREATE INDEX IF NOT EXISTS event_log_pending_idx ON event_log (id) WHERE published_at IS NULL;
    UPDATE event_log SET publish_attempts = 0 WHERE publish_attempts IS NULL;
    ALTER TABLE event_log
      ALTER COLUMN publish_attempts SET DEFAULT 0,
      ALTER COLUMN publish_attempts SET NOT NULL,
      ALTER COLUMN last_publish_error SET NOT NULL;
  `,
};
