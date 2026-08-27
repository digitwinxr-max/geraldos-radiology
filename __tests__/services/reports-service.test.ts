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
import { EVENT_TYPES, publishEvent } from "@/lib/events";
import {
  createReport,
  getReport,
  listReportVersions,
  listReports,
  saveReportVersion,
} from "@/services/reports-service";

beforeEach(() => {
  dbMock.reset();
  vi.clearAllMocks();
});

describe("reports service", () => {
  describe("listReports", () => {
    it("returns joined rows and total with pagination pass-through", async () => {
      dbMock.result([{ id: "r-1", status: "draft" }]);
      dbMock.result([{ count: 5 }]);

      const res = await listReports({ limit: 15, offset: 30, dir: "desc" });

      expect(res.total).toBe(5);
      expect(dbMock.callsFor("leftJoin")).toHaveLength(2);
      expect(dbMock.callsFor("limit")[0].args).toEqual([15]);
      expect(dbMock.callsFor("offset")[0].args).toEqual([30]);
    });

    it("filters by patient when patientId is provided", async () => {
      dbMock.result([]);
      dbMock.result([{ count: 0 }]);

      await listReports({ limit: 50, offset: 0, dir: "desc" });
      expect(dbMock.callsFor("where").every((c) => c.args[0] === undefined)).toBe(true);

      dbMock.reset();
      dbMock.result([]);
      dbMock.result([{ count: 0 }]);
      await listReports({ limit: 50, offset: 0, dir: "desc", patientId: "p-1" });
      expect(dbMock.callsFor("where").every((c) => c.args[0] !== undefined)).toBe(true);
    });
  });

  describe("createReport", () => {
    it("inserts, audits and publishes report.started", async () => {
      const input = { patientId: "p-1" };
      dbMock.result([{ id: "r-1", status: "draft", ...input }]);

      const row = await createReport(input);

      expect(row).toMatchObject({ id: "r-1" });
      expect(recordAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "report.created",
          module: "reporting",
          entityType: "report",
          entityId: "r-1",
        }),
      );
      expect(publishEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: EVENT_TYPES.REPORT_STARTED, aggregateId: "r-1" }),
      );
    });
  });

  it("getReport returns the row or null", async () => {
    dbMock.result([{ id: "r-1" }]);
    await expect(getReport("r-1")).resolves.toMatchObject({ id: "r-1" });

    dbMock.reset();
    dbMock.result([]);
    await expect(getReport("missing")).resolves.toBeNull();
  });

  describe("saveReportVersion", () => {
    const reportRow = {
      id: "r-1",
      findings: "No acute findings",
      impression: "Normal",
      recommendation: null,
      status: "draft",
    };

    it("returns null when the report does not exist", async () => {
      dbMock.result([]);

      await expect(saveReportVersion("missing", "user-1")).resolves.toBeNull();
      expect(dbMock.callsFor("insert")).toHaveLength(0);
      expect(publishEvent).not.toHaveBeenCalled();
    });

    it("creates version 1 when no previous version exists", async () => {
      dbMock.result([reportRow]); // the report
      dbMock.result([]); // latest version lookup
      dbMock.result([{ id: "v-1", version: 1 }]); // inserted version

      const version = await saveReportVersion("r-1", "user-1");

      expect(version).toMatchObject({ version: 1 });
      expect(dbMock.callsFor("values")[0].args).toEqual([
        {
          reportId: "r-1",
          version: 1,
          findings: "No acute findings",
          impression: "Normal",
          recommendation: null,
          status: "draft",
          qualityScore: null,
          aiAssisted: false,
          changedBy: "user-1",
        },
      ]);
      expect(publishEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: EVENT_TYPES.REPORT_VERSIONED,
          aggregateId: "r-1",
          payload: { version: 1 },
        }),
      );
    });

    it("increments from the latest stored version", async () => {
      dbMock.result([reportRow]);
      dbMock.result([{ version: 3 }]);
      dbMock.result([{ id: "v-4", version: 4 }]);

      const version = await saveReportVersion("r-1", "user-1");

      expect(version).toMatchObject({ version: 4 });
      const inserted = dbMock.callsFor("values")[0].args[0] as { version: number };
      expect(inserted.version).toBe(4);
    });
  });

  it("listReportVersions returns the scripted versions", async () => {
    dbMock.result([{ id: "v-2", version: 2 }, { id: "v-1", version: 1 }]);

    await expect(listReportVersions("r-1")).resolves.toHaveLength(2);
    expect(dbMock.callsFor("where")).toHaveLength(1);
  });
});
