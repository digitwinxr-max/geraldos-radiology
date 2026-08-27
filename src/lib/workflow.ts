/**
 * GeraldOS Radiology Workflow State Machine.
 *
 * The full clinical pipeline is modelled as an ordered, server-side state
 * machine. Studies never advance on the client's say-so — every transition is
 * validated here, written to the audit log, published to the event bus and
 * reflected in the worklist, command centre and notifications automatically.
 *
 *   Referral → Appointment → Patient Arrival → Study Created → Sent to Orthanc
 *   → Radiologist Assignment → Study Opened → AI Review → Report Draft
 *   → Report Signed → Report Released → Archive
 *
 * Rules:
 *  - Transitions are forward-only (a study can move to any later stage).
 *  - Backward moves are rejected with HTTP 409.
 *  - `sent_to_orthanc` requires a real DICOM studyInstanceUid.
 *  - `assigned` / `opened` require a radiologist.
 *  - `archived` is only reachable from `released` (forward-only enforces this).
 *  - Every transition records an audit entry, publishes the stage event plus a
 *    `worklist.updated` event, and raises notifications where appropriate.
 */

import { db } from "@/db";
import { workflowStudies, notifications, reports } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { recordAuditInTransaction } from "@/lib/audit";
import { recordEventInTransaction, EVENT_TYPES } from "@/lib/events";

export interface WorkflowStage {
  key: string;
  label: string;
  event: string;
  /** Stage shown in the worklist / boards. */
  tone: string;
}

/** Canonical pipeline — index order is the only source of truth. */
export const WORKFLOW_STAGES: WorkflowStage[] = [
  { key: "referral", label: "Referral", event: EVENT_TYPES.REFERRAL_RECEIVED, tone: "bg-slate-400" },
  { key: "appointment", label: "Appointment", event: EVENT_TYPES.APPOINTMENT_CREATED, tone: "bg-brand" },
  { key: "arrival", label: "Patient Arrival", event: EVENT_TYPES.APPOINTMENT_CHECKED_IN, tone: "bg-cyan-400" },
  { key: "study_created", label: "Study Created", event: EVENT_TYPES.STUDY_CREATED, tone: "bg-brand" },
  { key: "sent_to_orthanc", label: "Sent to Orthanc", event: EVENT_TYPES.STUDY_SENT_TO_ORTHANC, tone: "bg-brand-hover" },
  { key: "assigned", label: "Radiologist Assigned", event: EVENT_TYPES.STUDY_ASSIGNED, tone: "bg-ai" },
  { key: "opened", label: "Study Opened", event: EVENT_TYPES.STUDY_OPENED, tone: "bg-ai" },
  { key: "review", label: "AI Review", event: EVENT_TYPES.AI_REVIEW_COMPLETED, tone: "bg-ai" },
  { key: "report_draft", label: "Report Draft", event: EVENT_TYPES.REPORT_DRAFTED, tone: "bg-premium" },
  { key: "signed", label: "Report Signed", event: EVENT_TYPES.REPORT_SIGNED, tone: "bg-operational-hover" },
  { key: "released", label: "Report Released", event: EVENT_TYPES.REPORT_RELEASED, tone: "bg-operational" },
  { key: "archived", label: "Archive", event: EVENT_TYPES.STUDY_ARCHIVED, tone: "bg-slate-400" },
];

const STAGE_KEYS = WORKFLOW_STAGES.map((s) => s.key);

export function isWorkflowStage(value: string): value is (typeof STAGE_KEYS)[number] {
  return STAGE_KEYS.includes(value);
}

export function stageIndex(stage: string): number {
  const i = STAGE_KEYS.indexOf(stage);
  return i < 0 ? -1 : i;
}

export function stageMeta(stage: string): WorkflowStage | undefined {
  return WORKFLOW_STAGES.find((s) => s.key === stage);
}

export function stageLabel(stage: string): string {
  return stageMeta(stage)?.label ?? stage;
}

/** Stages strictly after `stage` in the pipeline. */
export function nextStagesOf(stage: string): string[] {
  const i = stageIndex(stage);
  return i < 0 ? [] : STAGE_KEYS.slice(i + 1);
}

/** The immediate next stage, or null at the end of the pipeline. */
export function nextStageOf(stage: string): string | null {
  return nextStagesOf(stage)[0] ?? null;
}

export interface TransitionResult {
  ok: boolean;
  status?: number;
  error?: string;
  study?: typeof workflowStudies.$inferSelect;
  fromStage?: string;
  toStage?: string;
  transitioned?: boolean;
}

/**
 * Advance a study to `to` — the ONLY sanctioned way to move a study forward.
 *
 * Guards:
 *  - `to` must be a known pipeline stage (400).
 *  - backward transitions are rejected (409).
 *  - `sent_to_orthanc` requires a studyInstanceUid (400).
 *  - `assigned` and `opened` require a radiologistId (400).
 */
export async function transitionStudy(opts: {
  studyId: string;
  to: string;
  changedBy?: string;
  studyInstanceUid?: string | null;
  radiologistId?: string | null;
}): Promise<TransitionResult> {
  const { studyId, to, changedBy = "workflow" } = opts;

  if (!isWorkflowStage(to)) {
    return { ok: false, status: 400, error: `"${to}" is not a valid workflow stage` };
  }

  // The whole transition — guard reads, conditional update, audit and events —
  // runs in ONE transaction (ADR-010): a committed stage change can never lose
  // its audit entry or its outbox event.
  return db.transaction(async (tx): Promise<TransitionResult> => {
    const [study] = await tx.select().from(workflowStudies).where(eq(workflowStudies.id, studyId));
    if (!study) return { ok: false, status: 404, error: "Study not found" };

    const from = study.stage;
    const fromIdx = stageIndex(from);
    const toIdx = stageIndex(to);

    if (toIdx < 0) return { ok: false, status: 400, error: `Unknown current stage "${from}"` };
    if (toIdx < fromIdx) {
      return {
        ok: false,
        status: 409,
        error: `Cannot move study from "${stageLabel(from)}" backwards to "${stageLabel(to)}"`,
      };
    }
    if (toIdx === fromIdx) {
      return { ok: true, study, fromStage: from, toStage: to, transitioned: false };
    }

    // Guards — hard requirements for clinically meaningful stages.
    if (to === "sent_to_orthanc" && !study.studyInstanceUid && !opts.studyInstanceUid) {
      return {
        ok: false,
        status: 400,
        error: "Study must be present in Orthanc (a DICOM studyInstanceUid) before it can be marked 'Sent to Orthanc'",
      };
    }
    if (to === "assigned" && !study.radiologistId && !opts.radiologistId) {
      return { ok: false, status: 400, error: "A radiologist must be assigned before the study can be marked 'Assigned'" };
    }
    if (to === "opened" && !study.radiologistId && !opts.radiologistId) {
      return { ok: false, status: 400, error: "Assign a radiologist before opening the study" };
    }
    // Hard handoff guards — a study can only be released once its report is
    // signed, and only released studies can be archived.
    if (to === "signed") {
      const [rep] = await tx.select({ status: reports.status }).from(reports).where(eq(reports.studyId, studyId)).limit(1);
      if (rep?.status !== "signed" && from !== "signed") {
        return { ok: false, status: 400, error: "Report must be signed by the radiologist before the study can be marked 'Report Signed'" };
      }
    }
    if (to === "released") {
      const [rep] = await tx.select({ status: reports.status }).from(reports).where(eq(reports.studyId, studyId)).limit(1);
      const signed = rep?.status === "signed" || from === "signed" || from === "released";
      if (!signed) {
        return { ok: false, status: 400, error: "Report must be signed before the study can be released" };
      }
    }
    if (to === "archived" && from !== "released") {
      return { ok: false, status: 400, error: "Only released studies can be archived" };
    }

    // Timestamps that reflect real lifecycle milestones.
    const updates: Record<string, unknown> = { stage: to, updatedAt: new Date() };
    if (to === "sent_to_orthanc" && opts.studyInstanceUid) updates.studyInstanceUid = opts.studyInstanceUid;
    if (to === "assigned" && opts.radiologistId) updates.radiologistId = opts.radiologistId;
    if (to === "opened" && !study.startedAt) updates.startedAt = new Date();
    if (to === "released" && !study.completedAt) updates.completedAt = new Date();

    // Optimistic concurrency: only update when the stage still matches the row
    // this decision was made on. A 0-row update means a concurrent transition
    // won the race — reject with 409 instead of silently double-applying.
    const [updated] = await tx
      .update(workflowStudies)
      .set(updates)
      .where(and(eq(workflowStudies.id, studyId), eq(workflowStudies.stage, from)))
      .returning();

    if (!updated) {
      return {
        ok: false,
        status: 409,
        error: `Study stage changed concurrently (no longer "${stageLabel(from)}") — retry the transition`,
      };
    }

    const payload = {
      fromStage: from,
      toStage: to,
      accessionNumber: updated.accessionNumber,
      modality: updated.modality,
      procedure: updated.procedure,
      changedBy,
    };

    // Audit — immutable record of every transition, atomic with the mutation.
    await recordAuditInTransaction(tx, {
      userId: changedBy,
      action: `workflow.transition`,
      module: "workflow",
      entityType: "workflow_study",
      entityId: studyId,
      details: payload,
    });

    // Events — the stage milestone plus an automatic worklist refresh signal.
    // Both go to the outbox inside this transaction (ADR-010).
    const stage = stageMeta(to);
    if (stage) {
      await recordEventInTransaction(tx, { type: stage.event, aggregate: "study", aggregateId: studyId, payload });
    }
    await recordEventInTransaction(tx, {
      type: EVENT_TYPES.WORKLIST_UPDATED,
      aggregate: "workflow",
      aggregateId: studyId,
      payload,
    });

    // Notifications for clinically significant handoffs — best-effort, never
    // blocks the transition.
    try {
      if (to === "assigned") {
        const radioId = (opts.radiologistId ?? study.radiologistId) ?? "all";
        await tx.insert(notifications).values({
          userId: radioId,
          title: "Study assigned to you",
          body: `${updated.procedure} (${updated.modality}) — ${updated.accessionNumber ?? ""} is ready for review`,
          type: "info",
          severity: "normal",
          link: `/workstation?studyId=${studyId}`,
        });
      }
      if (to === "released") {
        await tx.insert(notifications).values({
          userId: "all",
          title: "Report released",
          body: `Report released for ${updated.procedure} (${updated.accessionNumber ?? ""})`,
          type: "success",
          severity: "normal",
          link: `/workstation?studyId=${studyId}`,
        });
      }
    } catch {
      /* notification failure never blocks the transition */
    }

    return { ok: true, study: updated, fromStage: from, toStage: to, transitioned: true };
  });
}

/** Count studies per pipeline stage (for boards and dashboards). */
export async function workflowStageCounts(): Promise<{ stage: string; count: number }[]> {
  const rows = await db
    .select({ stage: workflowStudies.stage, count: sql<number>`count(*)::int` })
    .from(workflowStudies)
    .groupBy(workflowStudies.stage);
  return rows as { stage: string; count: number }[];
}


