/**
 * GeraldOS — Next.js Instrumentation (server startup hook)
 *
 * Runs once per server process when the Node.js runtime boots (including the
 * standalone production server). Used to start the event outbox relay so
 * transactional events are fanned out to Redis without any request having to
 * trigger it.
 *
 * See docs/DECISIONS.md ADR-010 for the delivery guarantees.
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Dynamic import keeps edge builds free of node-only modules.
  const { startOutboxRelay } = await import("@/lib/events");
  startOutboxRelay();
}
