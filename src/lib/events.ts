/**
 * GeraldOS Event Bus — durable event_log with PostgreSQL-native outbox.
 *
 * Delivery model (ADR-008/ADR-010, PostgreSQL-native):
 *
 *  1. DURABLE RECORD: `event_log` is the record of truth. The SSE stream and
 *     activity feeds read it directly. There is no secondary fan-out store.
 *  2. TRANSACTIONAL OUTBOX: critical domain flows insert their event in the
 *     SAME database transaction as the mutation (`recordEventInTransaction`).
 *     A committed state change can therefore never lose its event to a crash
 *     between two writes.
 *  3. STREAMING: `/api/events/stream` polls `event_log` in insertion order
 *     (gapless catch-up via cursor); SSE consumers read the durable table directly.
 *
 * GUARANTEE: persistence of the durable record is atomic with the domain
 * state change. Delivery to the SSE stream is exactly-once-per-row because the
 * stream reads the durable table directly with an ordered cursor.
 */

import { db } from "@/db";
import { eventLog } from "@/db/schema";
import { count, desc, eq, sql } from "drizzle-orm";
import { logger, serializeError } from "@/lib/logger";
import { getRequestContext } from "@/lib/request-context";

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

type EventLogInsert = typeof eventLog.$inferInsert;

function buildEventRow(input: PublishEventInput): EventLogInsert {
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
  };
}

/**
 * Insert an event INSIDE the caller's database transaction (outbox pattern).
 * Pass `tx` = the transaction handle; the row becomes visible atomically with
 * the domain mutation.
 */
export async function recordEventInTransaction(
  tx: DbClient,
  input: PublishEventInput,
): Promise<void> {
  await tx.insert(eventLog).values(buildEventRow(input));
}

/**
 * Publish an event outside an existing transaction: persist durably first.
 * Safe best-effort path for non-critical flows.
 */
export async function publishEvent(input: PublishEventInput): Promise<void> {
  try {
    await db.insert(eventLog).values(buildEventRow(input));
  } catch (error) {
    logger.error("event_log write failed", { err: serializeError(error), type: input.type });
  }
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
