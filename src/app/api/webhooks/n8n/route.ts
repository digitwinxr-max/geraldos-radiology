import { NextRequest, NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/n8n — inbound events from n8n automations back into GeraldOS.
 * Events are recorded in the audit log so n8n flows can acknowledge platform events.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const event = typeof body.event === "string" ? body.event : "n8n.webhook.generic";
  await recordAudit({
    userId: "n8n",
    action: event,
    module: "n8n",
    entityType: typeof body.entityType === "string" ? body.entityType : undefined,
    entityId: typeof body.entityId === "string" ? body.entityId : undefined,
    details: body,
  });
  return NextResponse.json({ ok: true, received: event, at: new Date().toISOString() });
}
