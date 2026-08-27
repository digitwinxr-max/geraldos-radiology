/**
 * Gate — previously unauthenticated routes now enforce a session.
 *
 * /api/decisions (AI decision engine), /api/knowledge (clinical knowledge
 * platform) and /api/workstation/context (case intelligence) expose sensitive
 * clinical/operational data and must reject anonymous requests with 401.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/db", async () => {
  const { dbMock } = await import("../helpers/db-mock");
  return { db: dbMock.db };
});
vi.mock("@/lib/audit", () => ({
  recordAudit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/events")>();
  return { ...actual, publishEvent: vi.fn().mockResolvedValue(undefined) };
});
vi.mock("@/lib/integrations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/integrations")>();
  return { ...actual, integrationConfig: { ...actual.integrationConfig, orthanc: { ...actual.integrationConfig.orthanc, url: "" } } };
});

import { GET as decisionsGET, POST as decisionsPOST } from "@/app/api/decisions/route";
import { GET as knowledgeGET, POST as knowledgePOST } from "@/app/api/knowledge/route";
import { GET as contextGET } from "@/app/api/workstation/context/route";

const BASE = "http://localhost";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("anonymous requests are rejected before any handler logic runs", () => {
  it("GET /api/decisions → 401", async () => {
    const res = await decisionsGET(new NextRequest(`${BASE}/api/decisions`));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHORIZED");
  });

  it("POST /api/decisions → 401", async () => {
    const res = await decisionsPOST(
      new NextRequest(`${BASE}/api/decisions`, {
        method: "POST",
        headers: { origin: BASE, "content-type": "application/json" },
        body: JSON.stringify({ agent: "x", recommendation: "y" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("GET /api/knowledge → 401", async () => {
    const res = await knowledgeGET(new NextRequest(`${BASE}/api/knowledge?q=ct`));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHORIZED");
  });

  it("POST /api/knowledge → 401", async () => {
    const res = await knowledgePOST(
      new NextRequest(`${BASE}/api/knowledge`, {
        method: "POST",
        headers: { origin: BASE, "content-type": "application/json" },
        body: JSON.stringify({ title: "t", category: "c", content: "x" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("GET /api/workstation/context → 401 (patient data stays behind auth)", async () => {
    const res = await contextGET(new NextRequest(`${BASE}/api/workstation/context?studyId=s-1`));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHORIZED");
  });
});
