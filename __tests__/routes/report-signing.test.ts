/**
 * Gate — report signing is restricted to radiologists and fails closed.
 *
 * A session with NO roles must never be able to finalise a report, and the
 * auto-finalise guard requires explicit `approvedBy` confirmation.
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
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth/session";
import { PATCH } from "@/app/api/reports/[id]/route";

const ORIGIN = "http://localhost";

async function cookieFor(roles: string[]): Promise<string> {
  const token = await createSessionToken({
    sub: `signer-${roles.join("-") || "noroles"}`,
    name: "Signing Test User",
    roles,
    iss: "geraldos-test",
  });
  return `${SESSION_COOKIE}=${token}`;
}

function patchRequest(cookie: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(`${ORIGIN}/api/reports/rpt-1`, {
    method: "PATCH",
    headers: {
      origin: ORIGIN,
      cookie,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

const EXISTING_REPORT = [{ id: "rpt-1", status: "draft", findings: "n", impression: "i", recommendation: "r" }];

beforeEach(() => {
  dbMock.reset();
  vi.clearAllMocks();
});

describe("PATCH /api/reports/[id] — signing authorisation", () => {
  it("returns 403 for a session with an empty roles array (fail closed)", async () => {
    dbMock.result(EXISTING_REPORT);

    const res = await PATCH(patchRequest(await cookieFor([]), { status: "signed", approvedBy: "someone" }), {
      params: Promise.resolve({ id: "rpt-1" }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("returns 403 for a non-radiologist role (manager)", async () => {
    dbMock.result(EXISTING_REPORT);

    const res = await PATCH(patchRequest(await cookieFor(["manager"]), { status: "signed", approvedBy: "mgr" }), {
      params: Promise.resolve({ id: "rpt-1" }),
    });

    expect(res.status).toBe(403);
  });

  it("allows a radiologist to sign with explicit approval", async () => {
    // lookup, version-snapshot report read + prev-version lookup + insert, update
    dbMock.result(EXISTING_REPORT);
    dbMock.result(EXISTING_REPORT);
    dbMock.result([]);
    dbMock.result([{ id: "v-1", version: 1 }]);
    dbMock.result([{ ...EXISTING_REPORT[0], status: "signed" }]);

    const res = await PATCH(
      patchRequest(await cookieFor(["radiologist"]), { status: "signed", approvedBy: "Dr. Test" }),
      { params: Promise.resolve({ id: "rpt-1" }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.report.status).toBe("signed");
  });

  it("rejects signing without approvedBy even for radiologists", async () => {
    dbMock.result(EXISTING_REPORT);

    const res = await PATCH(patchRequest(await cookieFor(["radiologist"]), { status: "signed" }), {
      params: Promise.resolve({ id: "rpt-1" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });
});
