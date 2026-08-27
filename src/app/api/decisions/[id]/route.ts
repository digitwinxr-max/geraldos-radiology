import { NextRequest, NextResponse } from "next/server";
import { approveDecision, rejectDecision, executeDecision } from "@/lib/decision-engine";
import { withAuth } from "@/lib/middleware-helpers";
import { validateBody, decisionActionSchema } from "@/lib/validation";
import { notFound, internalError } from "@/lib/api-error";

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
  return withAuth(request, "ai-review.write", async (user) => {
    const { id } = await params;
    const v = await validateBody(request, decisionActionSchema);
    if (!v.success) return v.error;

    // Human approval identity comes from the verified session — a request body
    // value can never impersonate the approver in the safety audit trail.
    const actor = user.name || user.sub;

    try {
      switch (v.data.action) {
        case "approve": {
          const decision = await approveDecision(id, actor);
          return NextResponse.json({ ok: true, decision });
        }
        case "reject": {
          const decision = await rejectDecision(id, actor, v.data.reason ?? undefined);
          return NextResponse.json({ ok: true, decision });
        }
        case "execute": {
          const decision = await executeDecision(id, actor);
          return NextResponse.json({ ok: true, decision });
        }
      }
    } catch (error) {
      if (error instanceof Error && /not found/.test(error.message)) return notFound("decision");
      return internalError(error);
    }
  });
}
