import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { aiObservations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { recordAudit } from "@/lib/audit";
import { publishEvent } from "@/lib/events";
import { withAuth } from "@/lib/middleware-helpers";
import { validateBody, reviewObservationSchema } from "@/lib/validation";
import { notFound, internalError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/ai-review/[id]
 *
 * The radiologist explicitly accepts or rejects an AI candidate observation.
 * Everything is audited and an event is published.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(request, "ai-review.write", async (user) => {
    const { id } = await params;
    const v = await validateBody(request, reviewObservationSchema);
    if (!v.success) return v.error;

    // Attribution always comes from the verified session, never the body —
    // accept/reject decisions are part of the clinical audit trail.
    const reviewedBy = user.name || user.sub;

    try {
      const [existing] = await db.select().from(aiObservations).where(eq(aiObservations.id, id));
      if (!existing) return notFound("observation");

      const [row] = await db
        .update(aiObservations)
        .set({ status: v.data.status, reviewedBy, reviewedAt: new Date() })
        .where(eq(aiObservations.id, id))
        .returning();

      await recordAudit({
        userId: reviewedBy,
        action: `ai.observation_${v.data.status}`,
        module: "ai-review",
        entityType: "ai_observation",
        entityId: id,
        details: { modality: existing.modality, region: existing.region, confidence: existing.confidence },
      });
      await publishEvent({
        type: v.data.status === "accepted" ? "ai.observation_accepted" : "ai.observation_rejected",
        aggregate: "ai-review",
        aggregateId: id,
        payload: { reviewedBy, modality: existing.modality, region: existing.region },
      });

      return NextResponse.json({ ok: true, observation: row });
    } catch (error) {
      return internalError(error);
    }
  });
}
