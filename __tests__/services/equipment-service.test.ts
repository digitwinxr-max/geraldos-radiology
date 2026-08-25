import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", async () => {
  const { dbMock } = await import("../helpers/db-mock");
  return { db: dbMock.db };
});

import { dbMock } from "../helpers/db-mock";
import {
  createEquipment,
  createMaintenanceRecord,
  getEquipment,
  listEquipment,
  listMaintenanceRecords,
} from "@/services/equipment-service";

beforeEach(() => dbMock.reset());

describe("equipment service", () => {
  it("listEquipment returns rows and total with pagination pass-through", async () => {
    dbMock.result([{ id: "eq-1", name: "CT Scanner 1" }]);
    dbMock.result([{ count: 6 }]);

    const res = await listEquipment({ limit: 5, offset: 10, dir: "desc" });

    expect(res.rows).toHaveLength(1);
    expect(res.total).toBe(6);
    expect(dbMock.callsFor("limit")[0].args).toEqual([5]);
    expect(dbMock.callsFor("offset")[0].args).toEqual([10]);
  });

  it("createEquipment inserts and returns the row", async () => {
    const input = { name: "MRI 3T", modality: "MRI" };
    dbMock.result([{ id: "eq-1", ...input }]);

    await expect(createEquipment(input)).resolves.toMatchObject({ name: "MRI 3T" });
    expect(dbMock.callsFor("values")[0].args).toEqual([input]);
    expect(dbMock.callsFor("returning")).toHaveLength(1);
  });

  it("getEquipment returns the row or null", async () => {
    dbMock.result([{ id: "eq-1" }]);
    await expect(getEquipment("eq-1")).resolves.toMatchObject({ id: "eq-1" });

    dbMock.reset();
    dbMock.result([]);
    await expect(getEquipment("missing")).resolves.toBeNull();
  });

  it("listMaintenanceRecords filters by equipment when an id is given", async () => {
    dbMock.result([{ id: "m-1" }]);
    await listMaintenanceRecords("eq-1");
    expect(dbMock.callsFor("where")).toHaveLength(1);

    dbMock.reset();
    dbMock.result([]);
    await listMaintenanceRecords();
    expect(dbMock.callsFor("where")).toHaveLength(0);
  });

  it("createMaintenanceRecord inserts and returns the row", async () => {
    const input = { equipmentId: "eq-1", type: "calibration", description: "Annual QA" };
    dbMock.result([{ id: "m-1", ...input }]);

    await expect(createMaintenanceRecord(input)).resolves.toMatchObject({ id: "m-1" });
    expect(dbMock.callsFor("values")[0].args).toEqual([input]);
  });
});
