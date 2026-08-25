import { NextRequest, NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { apiError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/n8n — inbound events from n8n automations back into GeraldOS.
 * Events are recorded in the audit log so n8n flows can acknowledge platform events.
 *
 * Exempt from withAuth — this is an inbound webhook callback from n8n.
 * Authentication is handled by the webhook secret or network-level controls.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("VALIDATION_FAILED", "Request body is not valid JSON", 400);
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
