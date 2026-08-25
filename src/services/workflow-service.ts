/**
 * GeraldOS Workflow Service
 *
 * Wraps the workflow state machine (src/lib/workflow.ts) and provides
 * study CRUD for the API layer.
 */

import { db } from "@/db";
import { workflowStudies, patients, staff } from "@/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { publishEvent, EVENT_TYPES } from "@/lib/events";
import { recordAudit } from "@/lib/audit";
import { transitionStudy, WORKFLOW_STAGES, stageLabel } from "@/lib/workflow";

export { transitionStudy, WORKFLOW_STAGES, stageLabel };

export async function listWorkflowStudies(opts: { limit?: number } = {}) {
  const limit = opts.limit ?? 100;
  const rows = await db
    .select({
      id: workflowStudies.id,
      patientId: workflowStudies.patientId,
      patientName: sql<string>`concat(${patients.firstName}, ' ', ${patients.lastName})`,
      accessionNumber: workflowStudies.accessionNumber,
      modality: workflowStudies.modality,
      procedure: workflowStudies.procedure,
      bodyPart: workflowStudies.bodyPart,
      stage: workflowStudies.stage,
      priority: workflowStudies.priority,
      radiologistId: workflowStudies.radiologistId,
      studyInstanceUid: workflowStudies.studyInstanceUid,
      startedAt: workflowStudies.startedAt,
      completedAt: workflowStudies.completedAt,
      createdAt: workflowStudies.createdAt,
      updatedAt: workflowStudies.updatedAt,
    })
    .from(workflowStudies)
    .leftJoin(patients, eq(workflowStudies.patientId, patients.id))
    .orderBy(desc(workflowStudies.createdAt))
    .limit(limit);

  return rows;
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
