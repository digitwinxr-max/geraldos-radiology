import { NextRequest, NextResponse } from "next/server";
import { approveDecision, rejectDecision, executeDecision } from "@/lib/decision-engine";
import { withAuth } from "@/lib/middleware-helpers";
import { validateBody, decisionActionSchema } from "@/lib/validation";
import { apiError, notFound, internalError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

/**
 * POST /api/decisions/[id]
 *
 * approve  → requires human identity; moves decision to approved.
 * reject   → requires human identity + optional reason.
 * execute  → only runs when the decision has explicit approval; executes the
 *            whitelisted action map and audits the outcome.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(request, "ai-review.write", async () => {
    const { id } = await params;
    const v = await validateBody(request, decisionActionSchema);
    if (!v.success) return v.error;

    try {
      switch (v.data.action) {
        case "approve": {
          if (!v.data.approvedBy) {
            return apiError("VALIDATION_FAILED", "approvedBy is required for approve action", 400);
          }
          const decision = await approveDecision(id, v.data.approvedBy);
          return NextResponse.json({ ok: true, decision });
        }
        case "reject": {
          if (!v.data.approvedBy) {
            return apiError("VALIDATION_FAILED", "approvedBy is required for reject action", 400);
          }
          const decision = await rejectDecision(id, v.data.approvedBy, v.data.reason ?? undefined);
          return NextResponse.json({ ok: true, decision });
        }
        case "execute": {
          const decision = await executeDecision(id, v.data.approvedBy ?? "system");
          return NextResponse.json({ ok: true, decision });
        }
      }
    } catch (error) {
      if (error instanceof Error && /not found/.test(error.message)) return notFound("decision");
      return internalError();
    }
  });
}
