import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { aiObservations, workflowStudies } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { generateCandidates } from "@/lib/ai-review";
import { recordAudit } from "@/lib/audit";
import { publishEvent } from "@/lib/events";
import { withAuth } from "@/lib/middleware-helpers";
import { validateBody, createAiReviewSchema } from "@/lib/validation";
import { internalError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

/** GET /api/ai-review?studyId=&orthancStudyId=&status=pending */
export async function GET(request: NextRequest) {
  return withAuth(request, "ai-review.read", async () => {
    const studyId = request.nextUrl.searchParams.get("studyId") ?? undefined;
    const orthancStudyId = request.nextUrl.searchParams.get("orthancStudyId") ?? undefined;
    const status = request.nextUrl.searchParams.get("status") ?? undefined;
    try {
      let rows;
      if (studyId) {
        rows = await db
          .select()
          .from(aiObservations)
          .where(eq(aiObservations.studyId, studyId))
          .orderBy(desc(aiObservations.createdAt));
      } else if (orthancStudyId) {
        rows = await db
          .select()
          .from(aiObservations)
          .where(eq(aiObservations.orthancStudyId, orthancStudyId))
          .orderBy(desc(aiObservations.createdAt));
      } else if (status) {
        rows = await db
          .select()
          .from(aiObservations)
          .where(eq(aiObservations.status, status))
          .orderBy(desc(aiObservations.createdAt))
          .limit(100);
      } else {
        rows = await db.select().from(aiObservations).orderBy(desc(aiObservations.createdAt)).limit(100);
      }
      return NextResponse.json({ ok: true, observations: rows });
    } catch {
      return internalError();
    }
  });
}

/**
 * POST /api/ai-review — generate AI candidate observations.
 *
 * Generates candidate observations and persists them as `pending`. The AI does
 * not diagnose — each candidate awaits radiologist accept-reject.
 */
export async function POST(request: NextRequest) {
  return withAuth(request, "ai-review.write", async () => {
    const v = await validateBody(request, createAiReviewSchema);
    if (!v.success) return v.error;

    try {
      let modality = v.data.modality;
      let bodyPart: string | null = v.data.bodyPart ?? null;
      let procedure: string | null = v.data.procedure ?? null;
      const studyId: string | null = v.data.studyId ?? null;

      if (v.data.studyId) {
        const [study] = await db.select().from(workflowStudies).where(eq(workflowStudies.id, v.data.studyId));
        if (study) {
          modality = study.modality;
          bodyPart = study.bodyPart ?? null;
          procedure = study.procedure;
        }
      }

      const candidates = generateCandidates({ modality, bodyPart, procedure });
      const inserted = await db
        .insert(aiObservations)
        .values(
          candidates.map((c) => ({
            studyId,
            orthancStudyId: v.data.orthancStudyId ?? null,
            modality,
            region: c.region,
            category: c.category,
            description: c.description,
            confidence: String(c.confidence),
            boundingBox: c.boundingBox ?? null,
            suggestedDifferential: c.suggestedDifferential,
            literatureRefs: c.literatureRefs,
            similarCaseIds: c.similarCaseIds,
            status: "pending",
          }))
        )
        .returning();

      await recordAudit({
        action: "ai.review_generated",
        module: "ai-review",
        entityType: "workflow_study",
        entityId: studyId ?? v.data.orthancStudyId ?? undefined,
        details: { modality, candidates: inserted.length },
      });
      await publishEvent({
        type: "ai.observation_suggested",
        aggregate: "ai-review",
        aggregateId: studyId ?? undefined,
        payload: { modality, candidates: inserted.length },
      });

      return NextResponse.json({ ok: true, observations: inserted, sources: ["geraldos-review-1"] }, { status: 201 });
    } catch {
      return internalError();
    }
  });
}
