import { NextRequest, NextResponse } from "next/server";
import { listEvents, publishEvent, EVENT_TYPES } from "@/lib/events";

export const dynamic = "force-dynamic";

/** GET /api/events?type=study.uploaded&limit=50 — recent platform events. */
export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get("type") ?? undefined;
  const limit = Math.min(200, Number(request.nextUrl.searchParams.get("limit") ?? 50));
  try {
    const events = await listEvents(limit, type);
    return NextResponse.json({ ok: true, events });
  } catch (error) {
    return NextResponse.json({ ok: false, error: "failed to load events", detail: String(error) }, { status: 500 });
  }
}

/** POST /api/events { type, aggregate, aggregateId, payload } — publish a manual event. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.type || !body?.aggregate) {
    return NextResponse.json({ error: "type and aggregate are required" }, { status: 400 });
  }
  const type = body.type as string;
  const known: string[] = Object.values(EVENT_TYPES);
  if (!known.includes(type) && !type.startsWith("custom.")) {
    return NextResponse.json({ error: `unknown event type "${type}"` }, { status: 400 });
  }
  await publishEvent({
    type,
    aggregate: body.aggregate,
    aggregateId: body.aggregateId ?? null,
    payload: body.payload ?? {},
    source: "manual",
  });
  return NextResponse.json({ ok: true });
}
