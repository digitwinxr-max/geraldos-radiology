/**
 * Gate — AI observation reviews are attributed to the authenticated session.
 *
 * The reviewedBy identity recorded in the audit trail comes from the verified
 * session token, never from the request body: an authenticated user cannot
 * attribute an accept/reject decision to someone else.
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

import { dbMock } from "../helpers/db-mock";
import { recordAudit } from "@/lib/audit";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth/session";
import { PATCH } from "@/app/api/ai-review/[id]/route";

const ORIGIN = "http://localhost";

beforeEach(() => {
  dbMock.reset();
  vi.clearAllMocks();
});

describe("PATCH /api/ai-review/[id] — session-bound attribution", () => {
  it("records the SESSION user as reviewedBy, ignoring a spoofed body value", async () => {
    const token = await createSessionToken({
      sub: "radiologist-1",
      name: "Dr. Real Reviewer",
      roles: ["radiologist"],
      iss: "geraldos-test",
    });
    // Observation lookup + update
    dbMock.result([{ id: "obs-1", modality: "CT", region: "lung", confidence: "0.91" }]);
    dbMock.result([{ id: "obs-1", status: "accepted" }]);

    const req = new NextRequest(`${ORIGIN}/api/ai-review/obs-1`, {
      method: "PATCH",
      headers: {
        origin: ORIGIN,
        cookie: `${SESSION_COOKIE}=${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ status: "accepted", reviewedBy: "Dr. Impostor" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "obs-1" }) });

    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "Dr. Real Reviewer",
        action: "ai.observation_accepted",
      }),
    );
  });
});
