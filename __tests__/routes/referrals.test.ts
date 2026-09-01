/**
 * Gate — /api/referrals route (smallest viable referral intake).
 *
 * Proves: anonymous requests fail closed; authenticated GET requires
 * `referrals.read`; POST validates the referral schema before touching the
 * database and requires `referrals.write`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

type RequestInitCompat = Omit<RequestInit, "signal"> & { signal?: AbortSignal };

vi.mock("@/db", async () => {
  const { dbMock } = await import("../helpers/db-mock");
  return { db: dbMock.db };
});
vi.mock("@/lib/middleware-helpers", () => ({
  withAuth: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({
  recordAudit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/events")>();
  return { ...actual, publishEvent: vi.fn().mockResolvedValue(undefined) };
});

import { dbMock, mockUser } from "../helpers/db-mock";
import { withAuth } from "@/lib/middleware-helpers";
import { recordAudit } from "@/lib/audit";
import { publishEvent } from "@/lib/events";
import { GET as referralsGET, POST as referralsPOST } from "@/app/api/referrals/route";

const BASE = "http://localhost";
const validBody = {
  patientId: "11111111-1111-4111-8111-111111111111",
  referringPhysician: "Dr. Seretse Khama",
  referringFacility: "Princess Marina Hospital",
  clinicalIndication: "Persistent headache",
  requestedProcedure: "CT Head",
  priority: "urgent",
};

function req(path: string, init: RequestInitCompat = {}) {
  return new NextRequest(`${BASE}${path}`, init);
}

beforeEach(() => {
  dbMock.reset();
  vi.clearAllMocks();
  vi.mocked(withAuth).mockImplementation(async (_req, _permission, handler) => handler(mockUser));
});

describe("anonymous requests fail closed", () => {
  it("GET /api/referrals → 401 untouched", async () => {
    vi.mocked(withAuth).mockImplementationOnce(async () =>
      NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 }),
    );

    const res = await referralsGET(req("/api/referrals"));

    expect(res.status).toBe(401);
    expect(dbMock.calls).toHaveLength(0);
  });

  it("POST /api/referrals → 401 untouched", async () => {
    vi.mocked(withAuth).mockImplementationOnce(async () =>
      NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 }),
    );

    const res = await referralsPOST(
      req("/api/referrals", { method: "POST", headers: { origin: BASE }, body: JSON.stringify(validBody) }),
    );

    expect(res.status).toBe(401);
    expect(dbMock.calls).toHaveLength(0);
  });
});

describe("GET /api/referrals", () => {
  it("requires the referrals.read permission and returns the list envelope", async () => {
    dbMock.result([{ id: "ref-1", patientFirstName: "Thato", patientLastName: "Ramotswe", patientMrn: "MRN0001" }]);
    dbMock.result([{ count: 1 }]);

    const res = await referralsGET(req("/api/referrals"));

    const [authReq, permission, handler] = vi.mocked(withAuth).mock.calls[0] ?? [];
    expect(authReq).toBeInstanceOf(NextRequest);
    expect(permission).toBe("referrals.read");
    expect(typeof handler).toBe("function");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.meta.total).toBe(1);
  });
});

describe("POST /api/referrals", () => {
  it("requires the referrals.write permission and creates a referral with audit + event", async () => {
    dbMock.result([{ id: "ref-1", patientId: validBody.patientId, referringPhysician: validBody.referringPhysician, priority: "urgent" }]);

    const res = await referralsPOST(
      req("/api/referrals", {
        method: "POST",
        headers: { origin: BASE, "content-type": "application/json" },
        body: JSON.stringify(validBody),
      }),
    );

    const [authReq, permission] = vi.mocked(withAuth).mock.calls[0] ?? [];
    expect(authReq).toBeInstanceOf(NextRequest);
    expect(permission).toBe("referrals.write");

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.referral.id).toBe("ref-1");
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "referral.received" }));
    expect(publishEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "referral.received" }));
  });

  it("rejects an invalid patientId with 400 and never touches the database", async () => {
    const res = await referralsPOST(
      req("/api/referrals", {
        method: "POST",
        headers: { origin: BASE, "content-type": "application/json" },
        body: JSON.stringify({ ...validBody, patientId: "not-a-uuid" }),
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
    expect(dbMock.calls).toHaveLength(0);
  });

  it("rejects a missing clinicalIndication with 400", async () => {
    const res = await referralsPOST(
      req("/api/referrals", {
        method: "POST",
        headers: { origin: BASE, "content-type": "application/json" },
        body: JSON.stringify({ ...validBody, clinicalIndication: "" }),
      }),
    );

    expect(res.status).toBe(400);
    expect(dbMock.calls).toHaveLength(0);
  });
});
