import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workflowStudies } from "@/db/schema";
import { generateAccessionNumber } from "@/lib/utils";
import { recordAudit } from "@/lib/audit";
import { publishEvent, EVENT_TYPES } from "@/lib/events";
import { withAuth } from "@/lib/middleware-helpers";
import { validateBody, createStudySchema } from "@/lib/validation";
import { internalError } from "@/lib/api-error";
import { parseListQuery, listEnvelope, serviceOpts } from "@/lib/list-query";
import { listWorkflowStudies } from "@/services/workflow-service";

export const dynamic = "force-dynamic";

/** GET /api/workflow — all studies with patient/radiologist context + stage label. */
export async function GET(request: NextRequest) {
  return withAuth(request, "workflow.read", async () => {
    const parsed = parseListQuery(request, { sorts: ["createdAt", "priority"] });
    if (!parsed.success) return parsed.error;

    try {
      const { rows, total } = await listWorkflowStudies(serviceOpts(parsed.data));
      return NextResponse.json(listEnvelope(rows, total, parsed.data.page, parsed.data.pageSize));
    } catch {
      return internalError();
    }
  });
}

/**
 * POST /api/workflow — create a study at the entry point of the pipeline.
 *
 * A study is born at `referral`. Optionally link an appointment; the study then
 * flows through the state machine exactly like every other study.
 */
export async function POST(request: NextRequest) {
  return withAuth(request, "workflow.write", async (user) => {
    const parsed = await validateBody(request, createStudySchema);
    if (!parsed.success) return parsed.error;

    try {
      const [study] = await db
        .insert(workflowStudies)
        .values({
          patientId: parsed.data.patientId,
          appointmentId: parsed.data.appointmentId ?? null,
          accessionNumber: generateAccessionNumber(),
          modality: parsed.data.modality,
          procedure: parsed.data.procedure,
          bodyPart: parsed.data.bodyPart ?? null,
          stage: "referral",
          priority: parsed.data.priority,
        })
        .returning();

      await recordAudit({
        userId: user.sub,
        action: "workflow.created",
        module: "workflow",
        entityType: "workflow_study",
        entityId: study.id,
        details: { procedure: study.procedure, modality: study.modality },
      });
      await publishEvent({
        type: EVENT_TYPES.REFERRAL_RECEIVED,
        aggregate: "study",
        aggregateId: study.id,
        payload: {
          accessionNumber: study.accessionNumber,
          procedure: study.procedure,
          modality: study.modality,
        },
      });
      await publishEvent({
        type: EVENT_TYPES.WORKLIST_UPDATED,
        aggregate: "workflow",
        aggregateId: study.id,
        payload: { reason: "study.created" },
      });

      return NextResponse.json({ ok: true, study }, { status: 201 });
    } catch {
      return internalError();
    }
  });
}
