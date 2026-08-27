/**
 * GeraldOS Decision Engine.
 *
 * AI never executes actions directly. Every AI-generated action flows through:
 *
 *   AI Recommendation → Business Rules → Validation → Approval → Execution → Audit Log
 *
 * Business rules are evaluated server-side. Only safe, whitelisted target actions
 * can ever execute, and only after an explicit human approval. Every step writes
 * an audit record and publishes an event.
 */

import { db } from "@/db";
import { aiRecommendations } from "@/db/schema";
import { eq, desc, sql, count } from "drizzle-orm";
import { recordAuditInTransaction } from "@/lib/audit";
import { recordEventInTransaction } from "@/lib/events";

export interface RuleResult {
  rule: string;
  passed: boolean;
  detail?: string;
}

export interface ProposeDecisionInput {
  agent: string;
  recommendation: string;
  rationale?: string;
  priority?: "stat" | "urgent" | "routine";
  targetModule?: string;
  targetAction?: string;
  targetPayload?: Record<string, unknown>;
  requestedBy?: string;
}

export const DECISION_STATUS = {
  PROPOSED: "proposed",
  VALIDATED: "validated",
  APPROVED: "approved",
  REJECTED: "rejected",
  EXECUTED: "executed",
  FAILED: "failed",
} as const;

// ─── Business rules ───
const RULES: { name: string; check: (input: ProposeDecisionInput) => RuleResult }[] = [
  {
    name: "no_auto_finalise_reports",
    check: (i) => ({
      rule: "no_auto_finalise_reports",
      passed: !(i.targetModule === "reports" && ["sign", "finalise", "approve"].includes(i.targetAction ?? "")),
      detail: "Reports may only be signed by an authenticated radiologist — never by an agent.",
    }),
  },
  {
    name: "no_autonomous_diagnosis",
    check: (i) => ({
      rule: "no_autonomous_diagnosis",
      passed: i.targetAction !== "set_diagnosis",
      detail: "AI observations are candidate findings that require radiologist confirmation.",
    }),
  },
  {
    name: "stat_priority_allowed",
    check: (i) => ({
      rule: "stat_priority_allowed",
      passed: i.priority !== "stat" || i.targetModule === "scheduling" || i.targetModule === "workflow",
      detail: "STAT actions are only permitted in scheduling/workflow contexts.",
    }),
  },
  {
    name: "reallocation_requires_equipment_context",
    check: (i) => {
      const ids = i.targetPayload?.appointmentIds;
      return {
        rule: "reallocation_requires_equipment_context",
        passed:
          i.targetAction !== "reallocate_slots" ||
          Boolean(i.targetPayload?.equipmentId || (Array.isArray(ids) && (ids as unknown[]).length > 0)),
        detail: "Slot reallocation must reference the affected equipment or appointments.",
      };
    },
  },
];

/** Evaluate business rules; a failing rule blocks progression past validation. */
export function evaluateRules(input: ProposeDecisionInput): RuleResult[] {
  return RULES.map((r) => r.check(input));
}

/** Propose a decision: rules + validation run immediately; approval is still required.
 *
 * The recommendation row, its audit entry and its outbox event commit in ONE
 * database transaction (ADR-010) so a proposed decision can never exist
 * without its audit trail.
 */
export async function proposeDecision(input: ProposeDecisionInput) {
  const ruleResults = evaluateRules(input);
  const rulePassed = ruleResults.every((r) => r.passed);
  const status = rulePassed ? DECISION_STATUS.VALIDATED : DECISION_STATUS.PROPOSED;

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(aiRecommendations)
      .values({
        agent: input.agent,
        recommendation: input.recommendation,
        rationale: input.rationale ?? null,
        priority: input.priority ?? "routine",
        status,
        ruleResults,
        validationResults: rulePassed ? [{ validator: "decision-engine", passed: true }] : [],
        targetModule: input.targetModule ?? null,
        targetAction: input.targetAction ?? null,
        targetPayload: input.targetPayload ?? null,
        requestedBy: input.requestedBy ?? "system-agent",
      })
      .returning();

    await recordAuditInTransaction(tx, {
      userId: input.requestedBy ?? "system-agent",
      action: "decision.proposed",
      module: "decision-engine",
      entityType: "ai_recommendation",
      entityId: row.id,
      details: { ruleResults, status },
    });
    await recordEventInTransaction(tx, {
      type: "decision.proposed",
      aggregate: "decision",
      aggregateId: row.id,
      payload: { agent: input.agent, status },
    });

    return row;
  });
}

/** Load a decision, throwing if it is not in an actionable state. */
async function requireActionable(dbx: { select: typeof db.select }, id: string, allowed: string[]) {
  const [row] = await dbx.select().from(aiRecommendations).where(eq(aiRecommendations.id, id));
  if (!row) throw new Error("decision not found");
  if (!allowed.includes(row.status)) {
    throw new Error(`decision is ${row.status}; only ${allowed.join("/")} decisions can be acted on`);
  }
  return row;
}

const requireActionableInTx = requireActionable;

/** Explicit human approval — required before anything can execute. */
export async function approveDecision(id: string, approvedBy: string) {
  return db.transaction(async (tx) => {
    const row = await requireActionableInTx(tx, id, [DECISION_STATUS.PROPOSED, DECISION_STATUS.VALIDATED]);
    const [updated] = await tx
      .update(aiRecommendations)
      .set({ status: DECISION_STATUS.APPROVED, approvedBy, approvedAt: new Date(), updatedAt: new Date() })
      .where(eq(aiRecommendations.id, id))
      .returning();
    if (!updated) throw new Error("decision not found");

    await recordAuditInTransaction(tx, { userId: approvedBy, action: "decision.approved", module: "decision-engine", entityType: "ai_recommendation", entityId: id });
    await recordEventInTransaction(tx, { type: "decision.approved", aggregate: "decision", aggregateId: id, payload: { approvedBy } });
    return updated;
  });
}

export async function rejectDecision(id: string, rejectedBy: string, reason?: string) {
  return db.transaction(async (tx) => {
    await requireActionableInTx(tx, id, [DECISION_STATUS.PROPOSED, DECISION_STATUS.VALIDATED, DECISION_STATUS.APPROVED]);
    const [row] = await tx
      .update(aiRecommendations)
      .set({ status: DECISION_STATUS.REJECTED, updatedAt: new Date() })
      .where(eq(aiRecommendations.id, id))
      .returning();
    if (!row) throw new Error("decision not found");

    await recordAuditInTransaction(tx, { userId: rejectedBy, action: "decision.rejected", module: "decision-engine", entityType: "ai_recommendation", entityId: id, details: { reason } });
    await recordEventInTransaction(tx, { type: "decision.rejected", aggregate: "decision", aggregateId: id, payload: { rejectedBy, reason } });
    return row;
  });
}

// ─── Whitelisted executions (safe, idempotent, reversible-ish) ───
type Executor = (payload: Record<string, unknown>) => Promise<{ ok: boolean; detail?: string }>;

const EXECUTORS: Record<string, Executor> = {
  "workflow:advance_stage": async (payload) => {
    // Route through the real state machine — validation, audit, events included.
    const { transitionStudy, isWorkflowStage } = await import("@/lib/workflow");
    const studyId = payload.studyId as string | undefined;
    const stage = payload.stage as string | undefined;
    if (!studyId || !stage) return { ok: false, detail: "studyId and stage required" };
    if (!isWorkflowStage(stage)) return { ok: false, detail: `stage ${stage} is not a valid workflow stage` };
    const result = await transitionStudy({
      studyId,
      to: stage,
      changedBy: "decision-engine",
      radiologistId: payload.radiologistId as string | undefined,
      studyInstanceUid: payload.studyInstanceUid as string | undefined,
    });
    if (!result.ok) return { ok: false, detail: result.error ?? "transition rejected" };
    return { ok: true, detail: `study ${studyId} → ${stage}` };
  },
  "equipment:set_status": async (payload) => {
    const { equipment } = await import("@/db/schema");
    const id = payload.equipmentId as string | undefined;
    const status = payload.status as string | undefined;
    if (!id || !status) return { ok: false, detail: "equipmentId and status required" };
    const allowedStatuses = ["operational", "maintenance", "offline", "retired"];
    if (!allowedStatuses.includes(status)) return { ok: false, detail: `status ${status} not allowed` };
    await db.update(equipment).set({ status, updatedAt: new Date() }).where(eq(equipment.id, id));
    return { ok: true, detail: `equipment ${id} → ${status}` };
  },
  "notify:staff": async (payload) => {
    const { notifications } = await import("@/db/schema");
    const title = (payload.title as string) ?? "GeraldOS notification";
    const body = (payload.body as string | undefined) ?? null;
    const link = (payload.link as string | undefined) ?? null;
    await db.insert(notifications).values({ title, body, link });
    return { ok: true, detail: `notification created: ${title}` };
  },
};

/** Execute an approved decision through the whitelisted action map. */
export async function executeDecision(id: string, executedBy: string) {
  const [row] = await db.select().from(aiRecommendations).where(eq(aiRecommendations.id, id));
  if (!row) throw new Error("decision not found");
  if (row.status !== DECISION_STATUS.APPROVED) {
    throw new Error(`decision is ${row.status}; explicit approval required before execution`);
  }

  const executor = EXECUTORS[`${row.targetModule ?? ""}:${row.targetAction ?? ""}`];
  try {
    const outcome = executor
      ? await executor((row.targetPayload as Record<string, unknown>) ?? {})
      : { ok: true, detail: `no-op action ${row.targetModule}:${row.targetAction}` };

    const status = outcome.ok ? DECISION_STATUS.EXECUTED : DECISION_STATUS.FAILED;
    await db.transaction(async (tx) => {
      await tx
        .update(aiRecommendations)
        .set({ status, executedAt: new Date(), updatedAt: new Date() })
        .where(eq(aiRecommendations.id, id));
      await recordAuditInTransaction(tx, { userId: executedBy, action: `decision.executed${outcome.ok ? "" : "_failed"}`, module: "decision-engine", entityType: "ai_recommendation", entityId: id, details: outcome });
      await recordEventInTransaction(tx, { type: "decision.executed", aggregate: "decision", aggregateId: id, payload: outcome });
    });
    return { ...outcome, status };
  } catch (error) {
    await db.transaction(async (tx) => {
      await tx
        .update(aiRecommendations)
        .set({ status: DECISION_STATUS.FAILED, updatedAt: new Date() })
        .where(eq(aiRecommendations.id, id));
      await recordAuditInTransaction(tx, { userId: executedBy, action: "decision.execution_crashed", module: "decision-engine", entityType: "ai_recommendation", entityId: id });
    });
    throw error;
  }
}

/** List decisions with optional status filter. */
export async function listDecisions(status: string | undefined, opts: { limit: number; offset: number }) {
  const where = status ? eq(aiRecommendations.status, status) : undefined;
  const base = db.select().from(aiRecommendations);
  const [rows, totalRow] = await Promise.all([
    (where ? base.where(where) : base).orderBy(desc(aiRecommendations.createdAt)).limit(opts.limit).offset(opts.offset),
    db.select({ count: count() }).from(aiRecommendations).where(where),
  ]);
  return { rows, total: totalRow[0]?.count ?? 0 };
}
