import { NextRequest, NextResponse } from "next/server";
import { approveDecision, rejectDecision, executeDecision } from "@/lib/decision-engine";

export const dynamic = "force-dynamic";

/**
 * POST /api/decisions/[id] { action: "approve" | "reject" | "execute", approvedBy, reason }
 *
 * approve  → requires human identity; moves decision to approved.
 * reject   → requires human identity + optional reason.
 * execute  → only runs when the decision has explicit approval; executes the
 *            whitelisted action map and audits the outcome.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body?.action) return NextResponse.json({ error: "action is required" }, { status: 400 });

  try {
    switch (body.action) {
      case "approve": {
        if (!body.approvedBy) return NextResponse.json({ error: "approvedBy is required" }, { status: 400 });
        const decision = await approveDecision(id, body.approvedBy);
        return NextResponse.json({ ok: true, decision });
      }
      case "reject": {
        if (!body.approvedBy) return NextResponse.json({ error: "approvedBy is required" }, { status: 400 });
        const decision = await rejectDecision(id, body.approvedBy, body.reason);
        return NextResponse.json({ ok: true, decision });
      }
      case "execute": {
        const decision = await executeDecision(id, body.approvedBy ?? "system");
        return NextResponse.json({ ok: true, decision });
      }
      default:
        return NextResponse.json({ error: `unknown action "${body.action}"` }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "decision action failed" },
      { status: error instanceof Error && /not found/.test(error.message) ? 404 : 400 }
    );
  }
}
