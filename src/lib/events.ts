/**
 * GeraldOS Event Bus — durable event_log + transactional outbox + Redis fan-out.
 *
 * Delivery model (ADR-008/ADR-010):
 *
 *  1. DURABLE RECORD: `event_log` is the record of truth. The SSE stream and
 *     activity feeds read it directly and never depend on Redis.
 *  2. TRANSACTIONAL OUTBOX: critical domain flows insert their event in the
 *     SAME database transaction as the mutation (`recordEventInTransaction`),
 *     with `publishedAt = null`. A committed state change can therefore never
 *     lose its event to a crash between the two writes.
 *  3. RELAY: a background relay (started from src/instrumentation.ts) selects
 *     pending rows FOR UPDATE SKIP LOCKED, XADDs them to the capped Redis
 *     stream, and stamps `publishedAt`. Failed attempts increment
 *     `publishAttempts` and stay pending for retry; replay is a simple
 *     `UPDATE ... SET published_at = NULL`.
 *
 * GUARANTEE (precise): persistence of the durable record is atomic with the
 * domain state change (exactly the outbox pattern). Delivery into Redis is
 * AT-LEAST-ONCE — a crash between XADD and the `publishedAt` stamp re-publishes
 * on the next pass, so Redis consumers MUST deduplicate on the event id carried
 * in the stream entry. There are no distributed transactions.
 *
 * When REDIS_URL is not configured events are persisted with
 * `publishedAt = occurredAt` (fan-out not applicable) and the relay idles.
 */

import { db } from "@/db";
import { eventLog } from "@/db/schema";
import { count, desc, eq, sql, and, asc, isNull } from "drizzle-orm";
import { getRedis } from "@/lib/redis";
import { logger, serializeError } from "@/lib/logger";
import { getRequestContext } from "@/lib/request-context";

export const EVENT_STREAM = "geraldos:events";
export const EVENT_GROUP = "geraldos-consumers";

/** Central registry of every domain event the platform emits. */
export const EVENT_TYPES = {
  PATIENT_REGISTERED: "patient.registered",
  PATIENT_UPDATED: "patient.updated",
  REFERRAL_RECEIVED: "referral.received",
  APPOINTMENT_CREATED: "appointment.created",
  APPOINTMENT_CHECKED_IN: "appointment.checked_in",
  APPOINTMENT_DELAYED: "appointment.delayed",
  STUDY_UPLOADED: "study.uploaded",
  STUDY_CREATED: "study.created",
  STUDY_SENT_TO_ORTHANC: "study.sent_to_orthanc",
  WORKLIST_UPDATED: "worklist.updated",
  STUDY_STARTED: "study.started",
  STUDY_COMPLETED: "study.completed",
  STUDY_ROUTED: "study.routed",
  STUDY_OPENED: "study.opened",
  STUDY_ASSIGNED: "study.assigned",
  VIEWER_CLOSED: "viewer.closed",
  MEASUREMENT_CREATED: "measurement.created",
  ANNOTATION_ADDED: "annotation.added",
  AI_REVIEW_COMPLETED: "ai.review_completed",
  REPORT_RELEASED: "report.released",
  STUDY_ARCHIVED: "study.archived",
  REPORT_STARTED: "report.started",
  REPORT_DRAFTED: "report.drafted",
  REPORT_APPROVED: "report.approved",
  REPORT_SIGNED: "report.signed",
  REPORT_VERSIONED: "report.versioned",
  AI_OBSERVATION_SUGGESTED: "ai.observation_suggested",
  AI_OBSERVATION_ACCEPTED: "ai.observation_accepted",
  AI_OBSERVATION_REJECTED: "ai.observation_rejected",
  DECISION_PROPOSED: "decision.proposed",
  DECISION_APPROVED: "decision.approved",
  DECISION_REJECTED: "decision.rejected",
  DECISION_EXECUTED: "decision.executed",
  INVENTORY_UPDATED: "inventory.updated",
  INVENTORY_LOW_STOCK: "inventory.low_stock",
  EQUIPMENT_ONLINE: "equipment.online",
  EQUIPMENT_OFFLINE: "equipment.offline",
  MAINTENANCE_SCHEDULED: "maintenance.scheduled",
  KNOWLEDGE_PUBLISHED: "knowledge.published",
  NOTIFICATION_SENT: "notification.sent",
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

export interface PublishEventInput {
  type: string;
  aggregate: string;
  aggregateId?: string | null;
  payload?: Record<string, unknown> | null;
  source?: string;
  /** Explicit trace id; defaults to the active request's requestId. */
  correlationId?: string | null;
}

/**
 * Minimal structural type accepted wherever a connection is available:
 * the root `db` or a `db.transaction(tx => ...)` handle.
 */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbClient = typeof db | Tx;

function resolveCorrelationId(explicit?: string | null): string | null {
  if (explicit) return explicit.slice(0, 64);
  return getRequestContext()?.requestId ?? null;
}

async function redisConfigured(): Promise<boolean> {
  try {
    return Boolean(await getRedis());
  } catch {
    return false;
  }
}

type EventLogInsert = typeof eventLog.$inferInsert;

function buildEventRow(input: PublishEventInput, publishedAt: Date | null): EventLogInsert {
  const occurredAt = new Date();
  const payload = { ...(input.payload ?? {}), occurredAt: occurredAt.toISOString() };
  return {
    eventType: input.type,
    aggregate: input.aggregate,
    aggregateId: input.aggregateId ?? null,
    payload,
    source: input.source ?? "app",
    correlationId: resolveCorrelationId(input.correlationId),
    occurredAt,
    publishedAt,
  };
}

/**
 * Insert an event INSIDE the caller's database transaction (outbox pattern).
 * Pass `tx` = the transaction handle; the row becomes visible atomically with
 * the domain mutation and the relay fans it out afterwards.
 */
export async function recordEventInTransaction(
  tx: DbClient,
  input: PublishEventInput,
): Promise<void> {
  const pending = await redisConfigured();
  await tx.insert(eventLog).values(buildEventRow(input, pending ? null : new Date()));
}

/**
 * Publish an event outside an existing transaction: persist durably first,
 * then let the relay fan out. Safe best-effort path for non-critical flows.
 */
export async function publishEvent(input: PublishEventInput): Promise<void> {
  try {
    await db.insert(eventLog).values(buildEventRow(input, (await redisConfigured()) ? null : new Date()));
  } catch (error) {
    logger.error("event_log write failed", { err: serializeError(error), type: input.type });
  }
}

// ─── Outbox relay ───

const RELAY_BATCH_SIZE = 100;
const RELAY_MAX_ROUNDS = 20;

export interface RelayResult {
  rounds: number;
  published: number;
  failed: number;
}

/**
 * One relay pass: drain up to RELAY_MAX_ROUNDS batches of pending events.
 * Rows are locked FOR UPDATE SKIP LOCKED so multiple app instances can run
 * relays concurrently without double-claiming a batch.
 */
export async function runOutboxRelayOnce(): Promise<RelayResult> {
  let published = 0;
  let failed = 0;
  let rounds = 0;

  const redis = await getRedis().catch(() => null);

  // No Redis configured → nothing to fan out; mark any stragglers delivered so
  // the pending backlog does not grow unbounded in Redis-less deployments.
  if (!redis) {
    const marked = await db
      .update(eventLog)
      .set({ publishedAt: new Date(), lastPublishError: null })
      .where(and(isNull(eventLog.publishedAt), eq(eventLog.publishAttempts, 0)))
      .returning({ id: eventLog.id });
    return { rounds: marked.length > 0 ? 1 : 0, published: 0, failed: 0 };
  }

  while (rounds < RELAY_MAX_ROUNDS) {
    rounds += 1;

    const done = await db.transaction(async (tx) => {
      const batch = await tx
        .select()
        .from(eventLog)
        .where(isNull(eventLog.publishedAt))
        .orderBy(asc(eventLog.id))
        .limit(RELAY_BATCH_SIZE)
        .for("update", { skipLocked: true });

      if (batch.length === 0) return true;

      for (const row of batch) {
        try {
          await redis
            .multi()
            .xadd(
              EVENT_STREAM,
              "MAXLEN", "~", 10000, "*",
              "id", String(row.id),
              "type", row.eventType,
              "aggregate", row.aggregate,
              "aggregateId", row.aggregateId ?? "",
              "source", row.source,
              "correlationId", row.correlationId ?? "",
              "payload", JSON.stringify(row.payload),
            )
            .exec();
          await tx
            .update(eventLog)
            .set({ publishedAt: new Date(), lastPublishError: null })
            .where(eq(eventLog.id, row.id));
          published += 1;
        } catch (error) {
          // Stay pending; record the attempt for observability and retry next pass.
          await tx
            .update(eventLog)
            .set({
              publishAttempts: row.publishAttempts + 1,
              lastPublishError: serializeError(error).message?.slice(0, 500) ?? "publish failed",
            })
            .where(eq(eventLog.id, row.id));
          failed += 1;
        }
      }
      return false;
    });

    if (done) break;
  }

  if (published > 0 || failed > 0) {
    logger.info("event relay pass", { published, failed, rounds });
  }
  return { rounds, published, failed };
}

let relayStarted = false;

/** Start the background relay exactly once per process (idempotent). */
export function startOutboxRelay(intervalMs = 2000): void {
  const g = globalThis as typeof globalThis & { __geraldosRelayStarted?: boolean };
  if (relayStarted || g.__geraldosRelayStarted) return;
  relayStarted = true;
  g.__geraldosRelayStarted = true;

  // Gracefully skip when DATABASE_URL is not configured (e.g. during builds
  // or in deployments where the DB provisioner hasn't finished yet).
  if (!process.env.DATABASE_URL) {
    logger.warn("outbox relay skipped — DATABASE_URL not set");
    return;
  }

  const tick = () => {
    runOutboxRelayOnce().catch((error) => {
      logger.error("event relay crashed", { err: serializeError(error) });
    });
  };
  const timer = setInterval(tick, intervalMs);
  // Never keep the process alive just for the relay.
  timer.unref?.();
  logger.info("outbox relay started", { intervalMs });
}

// ─── Read APIs ───

/** Read the tail of the event stream (most recent first). */
export async function listEvents(limit = 50, type?: string, offset = 0): Promise<{
  id: number;
  eventType: string;
  aggregate: string;
  aggregateId: string | null;
  payload: Record<string, unknown> | null;
  source: string;
  correlationId: string | null;
  occurredAt: Date;
}[]> {
  const rows = type
    ? await db.select().from(eventLog).where(eq(eventLog.eventType, type)).orderBy(desc(eventLog.id)).limit(limit).offset(offset)
    : await db.select().from(eventLog).orderBy(desc(eventLog.id)).limit(limit).offset(offset);
  return rows.map((r) => ({ ...r, payload: (r.payload ?? null) as Record<string, unknown> | null }));
}

/** Total number of persisted events, optionally filtered by type. */
export async function countEvents(type?: string): Promise<number> {
  const base = db.select({ count: count() }).from(eventLog);
  const rows = type ? await base.where(eq(eventLog.eventType, type)) : await base;
  return rows[0]?.count ?? 0;
}

/** Count events grouped by type (for the command centre activity feed). */
export async function eventCounts(): Promise<{ eventType: string; count: number }[]> {
  const rows = await db
    .select({ eventType: eventLog.eventType, count: sql<number>`count(*)` })
    .from(eventLog)
    .groupBy(eventLog.eventType)
    .orderBy(desc(sql`count(*)`));
  return rows as { eventType: string; count: number }[];
}
