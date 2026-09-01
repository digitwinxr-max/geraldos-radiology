/**
 * Gate — referrals service (smallest viable referral intake).
 *
 * Covers the service layer of the referral workflow: listing referrals with
 * patient context and registering a referral with audit + `referral.received`
 * event emission.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

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
import { publishEvent } from "@/lib/events";
import { listReferrals, createReferral } from "@/services/referrals-service";

const referralRow = {
  id: "ref-1",
  patientId: "patient-1",
  referringPhysician: "Dr. Seretse Khama",
  referringFacility: "Princess Marina Hospital",
  clinicalIndication: "Persistent headache, ?mass lesion",
  requestedProcedure: "CT Head",
  priority: "urgent",
  status: "pending",
  notes: null,
  createdAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.reset();
});

describe("listReferrals", () => {
  it("returns referrals with patient context in newest-first order", async () => {
    dbMock.result([
      { ...referralRow, patientFirstName: "Thato", patientLastName: "Ramotswe", patientMrn: "MRN0001" },
    ]);
    dbMock.result([{ count: 1 }]);

    const { rows, total } = await listReferrals({ limit: 20, offset: 0, sort: undefined, dir: "desc" });

    expect(total).toBe(1);
    expect(rows[0]).toMatchObject({ patientFirstName: "Thato", patientMrn: "MRN0001" });
    const selects = dbMock.callsFor("select");
    expect(selects.length).toBeGreaterThanOrEqual(2); // rows + count
  });

  it("filters by patientId when provided", async () => {
    dbMock.result([]);
    dbMock.result([{ count: 0 }]);

    await listReferrals({ limit: 20, offset: 0, sort: undefined, dir: "desc" }, "patient-9");

    const whereCalls = dbMock.callsFor("where");
    expect(whereCalls.length).toBeGreaterThan(0);
  });
});

describe("createReferral", () => {
  it("inserts the referral, writes an audit row and emits referral.received", async () => {
    dbMock.result([referralRow]);

    const row = await createReferral({
      patientId: "patient-1",
      referringPhysician: "Dr. Seretse Khama",
      referringFacility: "Princess Marina Hospital",
      clinicalIndication: "Persistent headache, ?mass lesion",
      requestedProcedure: "CT Head",
      priority: "urgent",
      status: "pending",
      notes: null,
    });

    expect(row.id).toBe("ref-1");
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "referral.received",
        entityType: "referral",
        entityId: "ref-1",
      }),
    );
    expect(publishEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "referral.received",
        aggregate: "referral",
        aggregateId: "ref-1",
      }),
    );
  });
});
