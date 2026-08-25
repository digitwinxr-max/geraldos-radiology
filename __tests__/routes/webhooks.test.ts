import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/audit", () => ({
  recordAudit: vi.fn().mockResolvedValue(undefined),
}));

import { recordAudit } from "@/lib/audit";
import { POST } from "@/app/api/webhooks/n8n/route";

beforeEach(() => vi.clearAllMocks());

function webhookRequest(body: string) {
  return new NextRequest("http://localhost/api/webhooks/n8n", {
    method: "POST",
    body,
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/webhooks/n8n", () => {
  it("rejects malformed JSON with 400 VALIDATION_FAILED", async () => {
    const res = await POST(webhookRequest("{not json"));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("acknowledges a valid event and audits it under the n8n user", async () => {
    const res = await POST(webhookRequest(JSON.stringify({ event: "n8n.flow.done", runId: 42 })));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.received).toBe("n8n.flow.done");
    expect(typeof body.at).toBe("string");
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "n8n",
        action: "n8n.flow.done",
        module: "n8n",
        details: { event: "n8n.flow.done", runId: 42 },
      }),
    );
  });

  it("defaults the event name when none is provided", async () => {
    const res = await POST(webhookRequest(JSON.stringify({ foo: "bar" })));

    const body = await res.json();
    expect(body.received).toBe("n8n.webhook.generic");
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "n8n.webhook.generic" }),
    );
  });

  it("passes entityType/entityId through to the audit record", async () => {
    await POST(
      webhookRequest(
        JSON.stringify({ event: "n8n.study.synced", entityType: "workflow_study", entityId: "s-1" }),
      ),
    );

    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "workflow_study", entityId: "s-1" }),
    );
  });
});
