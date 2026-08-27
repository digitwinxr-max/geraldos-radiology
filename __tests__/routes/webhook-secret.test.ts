/**
 * Gate — inbound n8n webhooks are authenticated with a shared secret.
 *
 * With N8N_WEBHOOK_SECRET configured, callers must present it in the
 * x-n8n-webhook-secret header. Without a secret, production fails closed (503)
 * and development allows the request with a warning.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/audit", () => ({
  recordAudit: vi.fn().mockResolvedValue(undefined),
}));

// integrationConfig is resolved once at module load, so tests drive the
// configured secret through a mutable holder instead of stubEnv.
let webhookSecret = "";

vi.doMock("@/lib/integrations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/integrations")>();
  return {
    ...actual,
    integrationConfig: {
      ...actual.integrationConfig,
      n8n: { ...actual.integrationConfig.n8n, get webhookSecret() { return webhookSecret; } },
    },
  };
});

const { POST } = await import("@/app/api/webhooks/n8n/route");
const { recordAudit } = await import("@/lib/audit");

function webhookRequest(body: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/webhooks/n8n", {
    method: "POST",
    body,
    headers: { "content-type": "application/json", ...headers },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  webhookSecret = "";
  vi.unstubAllEnvs();
  vi.stubEnv("NODE_ENV", "development");
});

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/webhooks/n8n — shared secret enforcement", () => {
  it("accepts a request presenting the correct secret", async () => {
    webhookSecret = "s3cret-value";

    const res = await POST(
      webhookRequest(JSON.stringify({ event: "n8n.flow.done" }), { "x-n8n-webhook-secret": "s3cret-value" }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("rejects a wrong secret with 401 and does not audit", async () => {
    webhookSecret = "s3cret-value";

    const res = await POST(
      webhookRequest(JSON.stringify({ event: "n8n.flow.done" }), { "x-n8n-webhook-secret": "wrong" }),
    );

    expect(res.status).toBe(401);
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("rejects a missing secret header when one is configured", async () => {
    webhookSecret = "s3cret-value";

    const res = await POST(webhookRequest(JSON.stringify({ event: "n8n.flow.done" })));

    expect(res.status).toBe(401);
  });

  it("fails closed in production when no secret is configured", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const res = await POST(webhookRequest(JSON.stringify({ event: "n8n.flow.done" })));

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe("WEBHOOK_SECRET_NOT_CONFIGURED");
  });

  it("still allows unauthenticated calls in development without a secret", async () => {
    const res = await POST(webhookRequest(JSON.stringify({ event: "n8n.flow.done" })));

    expect(res.status).toBe(200);
  });
});
