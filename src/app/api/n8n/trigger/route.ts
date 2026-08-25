import { NextRequest, NextResponse } from "next/server";
import { integrationConfig, timedFetch } from "@/lib/integrations";
import { recordAudit } from "@/lib/audit";
import { withAuth } from "@/lib/middleware-helpers";
import { apiError, internalError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

/** POST /api/n8n/trigger { workflow: "patient-arrived", data: {...} } */
export async function POST(request: NextRequest) {
  return withAuth(request, "integrations.write", async () => {
    const cfg = integrationConfig.n8n;
    const body = (await request.json()) as { workflow?: string; data?: Record<string, unknown> };
    const workflow = (body.workflow ?? "").replace(/[^a-zA-Z0-9-_]/g, "");
    if (!workflow) {
      return apiError("VALIDATION_FAILED", "workflow name is required", 400);
    }

    const base = cfg.webhookBase || (cfg.url ? `${cfg.url.replace(/\/$/, "")}/webhook` : "");
    if (!base) {
      return NextResponse.json({ error: { code: "NOT_CONFIGURED", message: "n8n is not configured (N8N_URL)" } }, { status: 503 });
    }

    try {
      const res = await timedFetch(
        `${base.replace(/\/$/, "")}/${encodeURIComponent(workflow)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: "geraldos", timestamp: new Date().toISOString(), ...(body.data ?? {}) }),
        },
        10000
      );
      await recordAudit({
        action: `n8n.trigger.${workflow}`,
        module: "n8n",
        details: { upstreamStatus: res.status, workflow },
      });
      const text = await res.text();
      let data: unknown = text;
      try { data = JSON.parse(text); } catch { /* plain text */ }
      return NextResponse.json({ ok: res.ok, upstreamStatus: res.status, data });
    } catch {
      return internalError();
    }
  });
}
