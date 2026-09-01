ALTER TABLE staff ADD COLUMN IF NOT EXISTS password_hash text;

DROP INDEX IF EXISTS event_log_pending_idx;
ALTER TABLE event_log
  ALTER COLUMN publish_attempts DROP DEFAULT,
  ALTER COLUMN publish_attempts DROP NOT NULL,
  ALTER COLUMN last_publish_error DROP NOT NULL;
