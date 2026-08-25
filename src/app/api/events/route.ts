import { NextRequest, NextResponse } from "next/server";
import { listEvents, publishEvent, EVENT_TYPES } from "@/lib/events";
import { withAuth } from "@/lib/middleware-helpers";
import { apiError, internalError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

/** GET /api/events?type=study.uploaded&limit=50 — recent platform events. */
export async function GET(request: NextRequest) {
  return withAuth(request, "workflow.read", async () => {
    const type = request.nextUrl.searchParams.get("type") ?? undefined;
    const limit = Math.min(200, Number(request.nextUrl.searchParams.get("limit") ?? 50));
    try {
      const events = await listEvents(limit, type);
      return NextResponse.json({ ok: true, events });
    } catch {
      return internalError();
    }
  });
}

/** POST /api/events { type, aggregate, aggregateId, payload } — publish a manual event. */
export async function POST(request: NextRequest) {
  return withAuth(request, "workflow.write", async () => {
    const body = await request.json().catch(() => null);
    if (!body?.type || !body?.aggregate) {
      return apiError("VALIDATION_FAILED", "type and aggregate are required", 400);
    }
    const type = body.type as string;
    const known: string[] = Object.values(EVENT_TYPES);
    if (!known.includes(type) && !type.startsWith("custom.")) {
      return apiError("VALIDATION_FAILED", `Unknown event type "${type}"`, 400);
    }

    try {
      await publishEvent({
        type,
        aggregate: body.aggregate,
        aggregateId: body.aggregateId ?? null,
        payload: body.payload ?? {},
        source: "manual",
      });
      return NextResponse.json({ ok: true });
    } catch {
      return internalError();
    }
  });
}
