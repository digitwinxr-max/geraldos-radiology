import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", async () => {
  const { dbMock } = await import("../helpers/db-mock");
  return { db: dbMock.db };
});

import { dbMock } from "../helpers/db-mock";
import { getAnalyticsSummary } from "@/services/analytics-service";

beforeEach(() => dbMock.reset());

describe("analytics service", () => {
  it("assembles the KPI summary from the nine queries", async () => {
    dbMock.result([{ count: 120 }]); // patients
    dbMock.result([{ count: 40 }]); // appointments
    dbMock.result([{ count: 33 }]); // studies
    dbMock.result([{ count: 6 }]); // equipment
    dbMock.result([{ count: 25 }]); // reports
    dbMock.result([{ id: "i-1" }, { id: "i-2" }]); // low-stock items
    dbMock.result([{ status: "operational", count: 5 }]); // equipmentByStatus
    dbMock.result([{ stage: "referral", count: 10 }]); // studiesByStage
    dbMock.result([{ modality: "CT", count: 12 }]); // studiesByModality

    const res = await getAnalyticsSummary();

    expect(res).toEqual({
      patients: 120,
      appointments: 40,
      studies: 33,
      equipment: 6,
      reports: 25,
      lowStockItems: 2,
      equipmentByStatus: [{ status: "operational", count: 5 }],
      studiesByStage: [{ stage: "referral", count: 10 }],
      studiesByModality: [{ modality: "CT", count: 12 }],
    });
  });

  it("counts low-stock items by row length, defaulting to zero", async () => {
    dbMock.result([{ count: 0 }]);
    dbMock.result([{ count: 0 }]);
    dbMock.result([{ count: 0 }]);
    dbMock.result([{ count: 0 }]);
    dbMock.result([{ count: 0 }]);
    dbMock.result([]); // no low-stock rows
    dbMock.result([]);
    dbMock.result([]);
    dbMock.result([]);

    const res = await getAnalyticsSummary();

    expect(res.lowStockItems).toBe(0);
    expect(res.patients).toBe(0);
  });

  it("survives empty result sets without throwing", async () => {
    dbMock.result([{ count: 0 }]);
    dbMock.result([{ count: 0 }]);
    dbMock.result([{ count: 0 }]);
    dbMock.result([{ count: 0 }]);
    dbMock.result([{ count: 0 }]);
    // Remaining breakdown queries fall back to [] (unscripted default).

    const res = await getAnalyticsSummary();

    expect(res.patients).toBe(0);
    expect(res.lowStockItems).toBe(0);
    expect(res.equipmentByStatus).toEqual([]);
    expect(res.studiesByStage).toEqual([]);
    expect(res.studiesByModality).toEqual([]);
  });
});
