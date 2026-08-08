import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { aiObservations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { recordAudit } from "@/lib/audit";
import { publishEvent } from "@/lib/events";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/ai-review/[id] { status: "accepted" | "rejected", reviewedBy }
 *
 * The radiologist explicitly accepts or rejects an AI candidate observation.
 * Everything is audited and an event is published.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || !["accepted", "rejected"].includes(body.status)) {
    return NextResponse.json({ error: "status must be accepted or rejected" }, { status: 400 });
  }
  if (!body.reviewedBy) {
    return NextResponse.json({ error: "reviewedBy (radiologist identity) is required" }, { status: 400 });
  }

  const [existing] = await db.select().from(aiObservations).where(eq(aiObservations.id, id));
  if (!existing) return NextResponse.json({ error: "observation not found" }, { status: 404 });

  const [row] = await db
    .update(aiObservations)
    .set({ status: body.status, reviewedBy: body.reviewedBy, reviewedAt: new Date() })
    .where(eq(aiObservations.id, id))
    .returning();

  await recordAudit({
    userId: body.reviewedBy,
    action: `ai.observation_${body.status}`,
    module: "ai-review",
    entityType: "ai_observation",
    entityId: id,
    details: { modality: existing.modality, region: existing.region, confidence: existing.confidence },
  });
  await publishEvent({
    type: body.status === "accepted" ? "ai.observation_accepted" : "ai.observation_rejected",
    aggregate: "ai-review",
    aggregateId: id,
    payload: { reviewedBy: body.reviewedBy, modality: existing.modality, region: existing.region },
  });

  return NextResponse.json({ ok: true, observation: row });
}
