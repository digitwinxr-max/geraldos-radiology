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
import { createPatient, getPatient, listPatients } from "@/services/patients";

beforeEach(() => {
  dbMock.reset();
  vi.clearAllMocks();
});

const patientRow = {
  id: "p-1",
  mrn: "MRN-001",
  firstName: "Ann",
  lastName: "Lee",
  dateOfBirth: "1990-01-01",
  gender: "female",
};

describe("patients service", () => {
  describe("listPatients", () => {
    it("returns rows and total, passing limit/offset through to the query", async () => {
      dbMock.result([{ id: "p-1" }, { id: "p-2" }]);
      dbMock.result([{ count: 12 }]);

      const res = await listPatients({ limit: 2, offset: 4, dir: "desc" });

      expect(res.rows).toHaveLength(2);
      expect(res.total).toBe(12);
      expect(dbMock.callsFor("limit")[0].args).toEqual([2]);
      expect(dbMock.callsFor("offset")[0].args).toEqual([4]);
    });

    it("defaults total to 0 when the count row is missing", async () => {
      dbMock.result([]);
      dbMock.result([]);

      const res = await listPatients({ limit: 50, offset: 0, dir: "desc" });

      expect(res.rows).toEqual([]);
      expect(res.total).toBe(0);
    });

    it("passes no where condition without a search term", async () => {
      dbMock.result([]);
      dbMock.result([{ count: 0 }]);

      await listPatients({ limit: 50, offset: 0, dir: "desc" });

      const wheres = dbMock.callsFor("where");
      expect(wheres.length).toBe(2);
      expect(wheres[0].args[0]).toBeUndefined();
    });

    it("applies a where condition when a search term is provided", async () => {
      dbMock.result([]);
      dbMock.result([{ count: 0 }]);

      await listPatients({ limit: 50, offset: 0, dir: "desc", search: "ann" });

      const wheres = dbMock.callsFor("where");
      expect(wheres[0].args[0]).toBeDefined();
      expect(wheres[1].args[0]).toBeDefined();
    });
  });

  describe("createPatient", () => {
    it("inserts the patient and returns the created row", async () => {
      dbMock.result([patientRow]);

      const input = {
        mrn: "MRN-001",
        firstName: "Ann",
        lastName: "Lee",
        dateOfBirth: "1990-01-01",
        gender: "female",
      };
      const row = await createPatient(input);

      expect(row).toEqual(patientRow);
      expect(dbMock.callsFor("insert")).toHaveLength(1);
      expect(dbMock.callsFor("values")[0].args).toEqual([input]);
      expect(dbMock.callsFor("returning")).toHaveLength(1);
    });

    it("records an audit entry and publishes patient.registered", async () => {
      dbMock.result([patientRow]);

      await createPatient({
        mrn: "MRN-001",
        firstName: "Ann",
        lastName: "Lee",
        dateOfBirth: "1990-01-01",
        gender: "female",
      });

      expect(recordAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "patient.created",
          module: "patients",
          entityType: "patient",
          entityId: "p-1",
          details: { mrn: "MRN-001" },
        }),
      );
      expect(publishEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: EVENT_TYPES.PATIENT_REGISTERED,
          aggregate: "patient",
          aggregateId: "p-1",
          payload: { mrn: "MRN-001", firstName: "Ann", lastName: "Lee" },
        }),
      );
    });
  });

  describe("getPatient", () => {
    it("returns the patient row when found", async () => {
      dbMock.result([patientRow]);

      await expect(getPatient("p-1")).resolves.toEqual(patientRow);
    });

    it("returns null when the patient does not exist", async () => {
      dbMock.result([]);

      await expect(getPatient("missing")).resolves.toBeNull();
    });
  });
});
