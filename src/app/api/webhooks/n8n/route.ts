import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual as nodeTimingSafeEqual } from "node:crypto";
import { recordAudit } from "@/lib/audit";
import { apiError, rateLimited } from "@/lib/api-error";
import { checkRateLimit } from "@/lib/rate-limit";
import { integrationConfig } from "@/lib/integrations";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/n8n — inbound events from n8n automations back into GeraldOS.
 * Events are recorded in the audit log so n8n flows can acknowledge platform events.
 *
 * Authentication (fail closed):
 *  - When N8N_WEBHOOK_SECRET is configured the caller must present it in the
 *    `x-n8n-webhook-secret` header (constant-time comparison).
 *  - When it is not configured, production refuses the request with 503 and
 *    development allows it with a logged warning so local automation keeps working.
 */
export async function POST(request: NextRequest) {
  const rl = await checkRateLimit("webhooks:n8n", request, { limit: 60, windowSec: 60 });
  if (!rl.allowed) return rateLimited(rl.retryAfterSec);

  const secret = integrationConfig.n8n.webhookSecret;
  if (secret) {
    const provided = request.headers.get("x-n8n-webhook-secret") ?? "";
    if (!timingSafeEqual(provided, secret)) {
      return apiError("UNAUTHORIZED", "Invalid webhook secret", 401);
    }
  } else {
    if (env.isProduction) {
      return apiError(
        "WEBHOOK_SECRET_NOT_CONFIGURED",
        "N8N_WEBHOOK_SECRET must be configured before inbound webhooks are accepted in production",
        503,
      );
    }
    logger.warn("n8n webhook accepted without a configured secret (development only)");
  }

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

/** Length-independent constant-time string comparison. */
function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = Buffer.from(a, "utf8");
  const bBytes = Buffer.from(b, "utf8");
  if (aBytes.length !== bBytes.length) {
    // Compare a against itself to keep the timing profile uniform.
    nodeTimingSafeEqual(aBytes, aBytes);
    return false;
  }
  return nodeTimingSafeEqual(aBytes, bBytes);
}
