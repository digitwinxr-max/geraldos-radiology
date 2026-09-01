/**
 * GeraldOS — Next.js Instrumentation (server startup hook)
 *
 * Runs once per server process when the Node.js runtime boots (including the
 * standalone production server).
 *
 * With the lean architecture the event bus is PostgreSQL-only and requires no
 * background relay (events are written transactionally and streamed straight
 * from the durable event_log), so there is nothing to start here. This hook is
 * retained as the single startup extension point should a background process
 * ever be needed again.
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // No-op — event streaming is PostgreSQL-native (see src/lib/events.ts).
}
