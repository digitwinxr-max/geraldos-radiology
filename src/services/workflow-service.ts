/**
 * GeraldOS Workflow Service
 *
 * Wraps the workflow state machine (src/lib/workflow.ts) and provides
 * study CRUD for the API layer.
 */

import { db } from "@/db";
import { workflowStudies, patients, staff } from "@/db/schema";
import { eq, desc, count } from "drizzle-orm";
import { publishEvent, EVENT_TYPES } from "@/lib/events";
import { recordAudit } from "@/lib/audit";
import { transitionStudy, WORKFLOW_STAGES, stageLabel } from "@/lib/workflow";
import { orderByDir, type ServiceListOpts } from "@/lib/list-query";

export { transitionStudy, WORKFLOW_STAGES, stageLabel };

/** Sort allowlist for GET /api/workflow (kept in sync with the route). */
const SORT_COLUMNS = {
  createdAt: workflowStudies.createdAt,
  priority: workflowStudies.priority,
} as const;

export async function listWorkflowStudies(opts: ServiceListOpts) {
  const order = opts.sort
    ? orderByDir(SORT_COLUMNS[opts.sort as keyof typeof SORT_COLUMNS], opts.dir)
    : desc(workflowStudies.createdAt);

  const base = db
    .select({
      id: workflowStudies.id,
      accessionNumber: workflowStudies.accessionNumber,
      studyInstanceUid: workflowStudies.studyInstanceUid,
      modality: workflowStudies.modality,
      procedure: workflowStudies.procedure,
      bodyPart: workflowStudies.bodyPart,
      stage: workflowStudies.stage,
      priority: workflowStudies.priority,
      startedAt: workflowStudies.startedAt,
      completedAt: workflowStudies.completedAt,
      createdAt: workflowStudies.createdAt,
      patientId: patients.id,
      patientFirstName: patients.firstName,
      patientLastName: patients.lastName,
      patientMrn: patients.mrn,
      radiologistId: staff.id,
      radiologistFirstName: staff.firstName,
      radiologistLastName: staff.lastName,
    })
    .from(workflowStudies)
    .leftJoin(patients, eq(workflowStudies.patientId, patients.id))
    .leftJoin(staff, eq(workflowStudies.radiologistId, staff.id));

  const [rows, totalRow] = await Promise.all([
    base.orderBy(order).limit(opts.limit).offset(opts.offset),
    db.select({ count: count() }).from(workflowStudies),
  ]);

  return {
    rows: rows.map((r) => ({ ...r, stageLabel: stageLabel(r.stage ?? "referral") })),
    total: totalRow[0]?.count ?? 0,
  };
}

export async function createWorkflowStudy(input: typeof workflowStudies.$inferInsert) {
  const [row] = await db.insert(workflowStudies).values(input).returning();

  await recordAudit({
    action: "study.created",
    module: "workflow",
    entityType: "workflow_study",
    entityId: row.id,
    details: { modality: row.modality, procedure: row.procedure },
  });
  await publishEvent({
    type: EVENT_TYPES.STUDY_CREATED,
    aggregate: "study",
    aggregateId: row.id,
    payload: { modality: row.modality, procedure: row.procedure },
  });

  return row;
}

export async function getWorkflowStudy(id: string) {
  const [row] = await db.select().from(workflowStudies).where(eq(workflowStudies.id, id));
  return row ?? null;
}
