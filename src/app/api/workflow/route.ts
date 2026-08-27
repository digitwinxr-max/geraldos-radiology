import { NextRequest, NextResponse } from "next/server";
import { createWorkflowStudy, listWorkflowStudies } from "@/services/workflow-service";
import { generateAccessionNumber } from "@/lib/utils";
import { withAuth } from "@/lib/middleware-helpers";
import { validateBody, createStudySchema } from "@/lib/validation";
import { internalError } from "@/lib/api-error";
import { parseListQuery, listEnvelope, serviceOpts } from "@/lib/list-query";

export const dynamic = "force-dynamic";

/** GET /api/workflow — all studies with patient/radiologist context + stage label. */
export async function GET(request: NextRequest) {
  return withAuth(request, "workflow.read", async () => {
    const parsed = parseListQuery(request, { sorts: ["createdAt", "priority"] });
    if (!parsed.success) return parsed.error;

    try {
      const { rows, total } = await listWorkflowStudies(serviceOpts(parsed.data));
      return NextResponse.json(listEnvelope(rows, total, parsed.data.page, parsed.data.pageSize));
    } catch (error) {
      return internalError(error);
    }
  });
}

/**
 * POST /api/workflow — create a study at the entry point of the pipeline.
 *
 * A study is born at `referral`. Optionally link an appointment; the study then
 * flows through the state machine exactly like every other study. Creation,
 * audit and events are committed atomically by the service.
 */
export async function POST(request: NextRequest) {
  return withAuth(request, "workflow.write", async (user) => {
    const parsed = await validateBody(request, createStudySchema);
    if (!parsed.success) return parsed.error;

    try {
      const study = await createWorkflowStudy(
        {
          patientId: parsed.data.patientId,
          appointmentId: parsed.data.appointmentId ?? null,
          accessionNumber: generateAccessionNumber(),
          modality: parsed.data.modality,
          procedure: parsed.data.procedure,
          bodyPart: parsed.data.bodyPart ?? null,
          stage: "referral",
          priority: parsed.data.priority,
        },
        user.sub,
      );
      return NextResponse.json({ ok: true, study }, { status: 201 });
    } catch (error) {
      return internalError(error);
    }
  });
}
