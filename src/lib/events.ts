/**
 * GeraldOS Event Bus — event-driven architecture over Redis Streams.
 *
 * Every major action publishes an event. Modules react to events; no synchronous
 * coupling. When REDIS_URL is configured the bus writes to the `geraldos:events`
 * Redis Stream (XADD, capped), otherwise — and always — events are persisted to
 * the `event_log` table so the audit/activity feed never depends on Redis uptime.
 */

import { db } from "@/db";
import { eventLog } from "@/db/schema";
import { count, desc, eq, sql } from "drizzle-orm";
import { getRedis } from "@/lib/redis";
import { logger, serializeError } from "@/lib/logger";

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
}

// ─── Redis client lives in src/lib/redis.ts (shared, lazy, non-fatal) ───

/** Publish an event to the Redis stream AND persist it to the event_log table. */
export async function publishEvent(input: PublishEventInput): Promise<void> {
  const occurredAt = new Date();
  const payload = { ...(input.payload ?? {}), occurredAt: occurredAt.toISOString() };

  // 1) Redis Streams (best-effort, capped)
  try {
    const redis = await getRedis();
    if (redis) {
      await redis
        .multi()
        .xadd(EVENT_STREAM, "MAXLEN", "~", 10000, "*", "type", input.type, "aggregate", input.aggregate, "aggregateId", input.aggregateId ?? "", "source", input.source ?? "app", "payload", JSON.stringify(payload))
        .exec();
    }
  } catch {
    // Redis down — event_log remains the durable record.
  }

  // 2) Durable persistence (best-effort)
  try {
    await db.insert(eventLog).values({
      eventType: input.type,
      aggregate: input.aggregate,
      aggregateId: input.aggregateId ?? null,
      payload,
      source: input.source ?? "app",
    });
  } catch (error) {
    logger.error("event_log write failed", { err: serializeError(error), type: input.type });
  }
}

/** Read the tail of the event stream (most recent first). */
export async function listEvents(limit = 50, type?: string, offset = 0): Promise<{
  id: number;
  eventType: string;
  aggregate: string;
  aggregateId: string | null;
  payload: Record<string, unknown> | null;
  source: string;
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
