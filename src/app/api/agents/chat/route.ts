import { NextRequest, NextResponse } from "next/server";
import { AGENT_MAP, AGENTS, handleAgentRequest } from "@/lib/agents";
import { recordAudit } from "@/lib/audit";
import { withAuth } from "@/lib/middleware-helpers";
import { apiError, internalError, rateLimited } from "@/lib/api-error";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/agents/chat { agent: "reporting", message: "..." }
 *
 * Dispatches to the local live-data agent brain (src/lib/agents.ts). Every
 * reply is decision support only — no state is changed outside the audit log
 * and the decision engine.
 */
export async function POST(request: NextRequest) {
  return withAuth(request, "ai-review.write", async (user) => {
    // Keyed by the authenticated user so one heavy consumer cannot starve others.
    const rl = await checkRateLimit("agents:chat", request, { limit: 20, windowSec: 60 }, user.sub || undefined);
    if (!rl.allowed) return rateLimited(rl.retryAfterSec);

    let body: { agent?: string; message?: string };
    try {
      body = (await request.json()) as { agent?: string; message?: string };
    } catch {
      return apiError("VALIDATION_FAILED", "Request body is not valid JSON", 400);
    }
    const agentId = (body.agent ?? "executive").toLowerCase();
    const message = (body.message ?? "").trim();
    if (!message) return apiError("VALIDATION_FAILED", "message is required", 400);
    if (!AGENT_MAP[agentId]) {
      return apiError("VALIDATION_FAILED", `Unknown agent "${agentId}"`, 400, { agents: AGENTS.map((a) => a.id) });
    }

    const agent = AGENT_MAP[agentId];
    await recordAudit({
      action: "agent.interaction",
      module: "agents",
      entityType: "agent",
      entityId: agentId,
      details: { message: message.slice(0, 200) },
    });

    try {
      const { reply, sources } = await handleAgentRequest(agentId, message);
      return NextResponse.json({
        agent: agent.name,
        mission: agent.mission,
        reply,
        sources: sources ?? [],
        source: "local-simulation",
      });
    } catch (error) {
      return internalError(error);
    }
  });
}
