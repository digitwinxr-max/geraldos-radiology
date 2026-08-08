import { NextRequest, NextResponse } from "next/server";
import { listDecisions, proposeDecision } from "@/lib/decision-engine";

export const dynamic = "force-dynamic";

/** GET /api/decisions?status=validated — decisions through the engine. */
export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get("status") ?? undefined;
  try {
    const decisions = await listDecisions(status);
    return NextResponse.json({ ok: true, decisions });
  } catch (error) {
    return NextResponse.json({ ok: false, error: "failed to load decisions", detail: String(error) }, { status: 500 });
  }
}

/** POST /api/decisions { agent, recommendation, rationale, priority, targetModule, targetAction, targetPayload } */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.agent || !body?.recommendation) {
    return NextResponse.json({ error: "agent and recommendation are required" }, { status: 400 });
  }
  try {
    const decision = await proposeDecision({
      agent: body.agent,
      recommendation: body.recommendation,
      rationale: body.rationale,
      priority: body.priority ?? "routine",
      targetModule: body.targetModule,
      targetAction: body.targetAction,
      targetPayload: body.targetPayload,
      requestedBy: body.requestedBy ?? "system-agent",
    });
    return NextResponse.json({ ok: true, decision }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "failed to propose decision", detail: String(error) }, { status: 500 });
  }
}
