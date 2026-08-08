import { NextRequest, NextResponse } from "next/server";
import { integrationConfig } from "@/lib/integrations";
import { AGENT_MAP, AGENTS, handleAgentRequest } from "@/lib/agents";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** Attempt a real LangGraph Platform run (thread + run/wait). */
async function runOnLangGraph(agentId: string, message: string): Promise<string> {
  const cfg = integrationConfig.langgraph;
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (cfg.apiKey) headers["X-Api-Key"] = cfg.apiKey;

  const threadRes = await fetch(`${cfg.url}/threads`, {
    method: "POST",
    headers,
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(6000),
  });
  if (!threadRes.ok) throw new Error(`thread create HTTP ${threadRes.status}`);
  const thread = (await threadRes.json()) as { thread_id: string };

  const runRes = await fetch(`${cfg.url}/threads/${thread.thread_id}/runs/wait`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      assistant_id: cfg.assistantId || `geraldos-${agentId}`,
      input: { messages: [{ role: "user", content: `[GeraldOS ${agentId}-agent] ${message}` }] },
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!runRes.ok) throw new Error(`run HTTP ${runRes.status}`);
  const result = (await runRes.json()) as { messages?: { role: string; content: string }[] };
  const last = result.messages?.filter((m) => m.role === "assistant").pop();
  if (!last?.content) throw new Error("empty agent response");
  return last.content;
}

/** POST /api/agents/chat { agent: "reporting", message: "..." } */
export async function POST(request: NextRequest) {
  let body: { agent?: string; message?: string };
  try {
    body = (await request.json()) as { agent?: string; message?: string };
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const agentId = (body.agent ?? "executive").toLowerCase();
  const message = (body.message ?? "").trim();
  if (!message) return NextResponse.json({ error: "message required" }, { status: 400 });
  if (!AGENT_MAP[agentId]) {
    return NextResponse.json(
      { error: "unknown agent", agents: AGENTS.map((a) => a.id) },
      { status: 400 }
    );
  }

  const agent = AGENT_MAP[agentId];
  await recordAudit({
    action: "agent.interaction",
    module: "agents",
    entityType: "agent",
    entityId: agentId,
    details: { message: message.slice(0, 200) },
  });

  const langgraphConfigured = Boolean(integrationConfig.langgraph.url);
  if (langgraphConfigured) {
    try {
      const reply = await runOnLangGraph(agentId, message);
      return NextResponse.json({ agent: agent.name, reply, source: "langgraph" });
    } catch {
      // Fall through to the live-data brain.
    }
  }

  const { reply, sources } = await handleAgentRequest(agentId, message);
  return NextResponse.json({
    agent: agent.name,
    mission: agent.mission,
    reply,
    sources: sources ?? [],
    source: langgraphConfigured ? "local-fallback" : "local-simulation",
  });
}
