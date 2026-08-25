import { NextRequest, NextResponse } from "next/server";
import { listDecisions, proposeDecision } from "@/lib/decision-engine";
import { internalError, validationFailed } from "@/lib/api-error";
import { parseListQuery, serviceOpts, listEnvelope } from "@/lib/list-query";

export const dynamic = "force-dynamic";

/** GET /api/decisions?status=validated — decisions through the engine. */
export async function GET(request: NextRequest) {
  const parsed = parseListQuery(request);
  if (!parsed.success) return parsed.error;
  const status = request.nextUrl.searchParams.get("status") ?? undefined;
  try {
    const { rows, total } = await listDecisions(status, serviceOpts(parsed.data));
    return NextResponse.json(listEnvelope(rows, total, parsed.data.page, parsed.data.pageSize));
  } catch (error) {
    return internalError(error);
  }
}

/** POST /api/decisions { agent, recommendation, rationale, priority, targetModule, targetAction, targetPayload } */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.agent || !body?.recommendation) {
    return validationFailed([{ message: "agent and recommendation are required" }]);
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
    return internalError(error);
  }
}
