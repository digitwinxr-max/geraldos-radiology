/**
 * Gate â€” optimistic concurrency on workflow transitions.
 *
 * The stage update is conditional on the stage observed during guard
 * evaluation. When a concurrent transition changed the stage first, the update
 * matches 0 rows and transitionStudy must reject with 409 instead of
 * double-applying the move.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", async () => {
  const { dbMock } = await import("../helpers/db-mock");
  return { db: dbMock.db };
});
vi.mock("@/lib/audit", () => ({
  recordAudit: vi.fn().mockResolvedValue(undefined),
  recordAuditInTransaction: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/events")>();
  return {
    ...actual,
    publishEvent: vi.fn().mockResolvedValue(undefined),
    recordEventInTransaction: vi.fn().mockResolvedValue(undefined),
  };
});

import { dbMock } from "../helpers/db-mock";
import { transitionStudy } from "@/lib/workflow";

beforeEach(() => {
  dbMock.reset();
  vi.clearAllMocks();
});

describe("transitionStudy â€” lost-update protection", () => {
  it("rejects with 409 when the study no longer sits at the observed stage", async () => {
    // Study lookup observes "referral"...
    dbMock.result([{ id: "s-1", stage: "referral", accessionNumber: "ACC-1", modality: "CT", procedure: "Chest CT" }]);
    // ...but the conditional UPDATE matches 0 rows (stage moved concurrently).
    dbMock.result([]);

    const res = await transitionStudy({ studyId: "s-1", to: "appointment" });

    expect(res).toMatchObject({ ok: false, status: 409 });
    expect(res.error).toContain("changed concurrently");
  });

  it("applies the transition when the stage still matches", async () => {
    const study = { id: "s-1", stage: "referral", accessionNumber: "ACC-1", modality: "CT", procedure: "Chest CT" };
    dbMock.result([study]);
    dbMock.result([{ ...study, stage: "appointment" }]);

    const res = await transitionStudy({ studyId: "s-1", to: "appointment" });

    expect(res.ok).toBe(true);
    expect(res.transitioned).toBe(true);
    expect(res.study?.stage).toBe("appointment");

    // The UPDATE must be conditioned on both id AND the observed stage.
    const updateCalls = dbMock.callsFor("tx.update");
    expect(updateCalls).toHaveLength(1);
  });

  it("is idempotent when the target equals the current stage", async () => {
    dbMock.result([{ id: "s-1", stage: "opened", accessionNumber: "ACC-1", modality: "CT", procedure: "Chest CT", radiologistId: null }]);

    const res = await transitionStudy({ studyId: "s-1", to: "opened" });

    expect(res).toMatchObject({ ok: true, transitioned: false });
  });
});
