import { NextRequest, NextResponse } from "next/server";
import { listEvents, countEvents, publishEvent, EVENT_TYPES } from "@/lib/events";
import { withAuth } from "@/lib/middleware-helpers";
import { apiError, internalError } from "@/lib/api-error";
import { parseListQuery, listEnvelope } from "@/lib/list-query";

export const dynamic = "force-dynamic";

/** GET /api/events?type=study.uploaded&page=1&pageSize=50 — recent platform events. */
export async function GET(request: NextRequest) {
  return withAuth(request, "workflow.read", async () => {
    const parsed = parseListQuery(request);
    if (!parsed.success) return parsed.error;
    const type = request.nextUrl.searchParams.get("type") ?? undefined;
    try {
      const { page, pageSize, offset } = parsed.data;
      const [events, total] = await Promise.all([listEvents(pageSize, type, offset), countEvents(type)]);
      return NextResponse.json(listEnvelope(events, total, page, pageSize));
    } catch (error) {
      return internalError(error);
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
    } catch (error) {
      return internalError(error);
    }
  });
}
