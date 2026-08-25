import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", async () => {
  const { dbMock } = await import("../helpers/db-mock");
  return { db: dbMock.db };
});

import { dbMock } from "../helpers/db-mock";
import {
  createBranch,
  createEmployee,
  createRole,
  createStaff,
  getStaff,
  listBranches,
  listEmployees,
  listRoles,
  listStaff,
} from "@/services/staff-service";

beforeEach(() => dbMock.reset());

const listOpts = { limit: 50, offset: 0, dir: "desc" as const };

describe("staff service", () => {
  describe("staff", () => {
    it("listStaff returns rows and total with pagination pass-through", async () => {
      dbMock.result([{ id: "st-1", lastName: "Naidoo" }]);
      dbMock.result([{ count: 7 }]);

      const res = await listStaff({ limit: 3, offset: 6, dir: "desc" });

      expect(res.total).toBe(7);
      expect(dbMock.callsFor("limit")[0].args).toEqual([3]);
      expect(dbMock.callsFor("offset")[0].args).toEqual([6]);
    });

    it("createStaff inserts and returns the row", async () => {
      const input = { firstName: "Priya", lastName: "Naidoo", role: "radiologist" };
      dbMock.result([{ id: "st-1", ...input }]);

      await expect(createStaff(input)).resolves.toMatchObject({ id: "st-1" });
      expect(dbMock.callsFor("values")[0].args).toEqual([input]);
    });

    it("getStaff returns the row or null", async () => {
      dbMock.result([{ id: "st-1" }]);
      await expect(getStaff("st-1")).resolves.toMatchObject({ id: "st-1" });

      dbMock.reset();
      dbMock.result([]);
      await expect(getStaff("missing")).resolves.toBeNull();
    });
  });

  describe("employee records", () => {
    it("listEmployees joins staff and branch details", async () => {
      dbMock.result([{ id: "emp-1", staffLastName: "Naidoo", branchName: "Sandton" }]);
      dbMock.result([{ count: 2 }]);

      const res = await listEmployees(listOpts);

      expect(res.rows[0]).toMatchObject({ branchName: "Sandton" });
      expect(res.total).toBe(2);
      expect(dbMock.callsFor("leftJoin")).toHaveLength(2);
    });

    it("createEmployee inserts and returns the row", async () => {
      const input = { staffId: "st-1", employeeNumber: "E-100" };
      dbMock.result([{ id: "emp-1", ...input }]);

      await expect(createEmployee(input)).resolves.toMatchObject({ id: "emp-1" });
      expect(dbMock.callsFor("values")[0].args).toEqual([input]);
    });
  });

  describe("roles", () => {
    it("listRoles returns rows and total", async () => {
      dbMock.result([{ id: "r-1", name: "radiologist" }]);
      dbMock.result([{ count: 4 }]);

      const res = await listRoles(listOpts);

      expect(res.rows).toHaveLength(1);
      expect(res.total).toBe(4);
    });

    it("createRole inserts and returns the row", async () => {
      const input = { name: "receptionist" };
      dbMock.result([{ id: "r-2", ...input }]);

      await expect(createRole(input)).resolves.toMatchObject({ name: "receptionist" });
    });
  });

  describe("branches", () => {
    it("listBranches returns rows and total", async () => {
      dbMock.result([{ id: "b-1", name: "Sandton" }]);
      dbMock.result([{ count: 2 }]);

      const res = await listBranches(listOpts);

      expect(res.total).toBe(2);
    });

    it("createBranch inserts and returns the row", async () => {
      const input = { name: "Rosebank", code: "RBK" };
      dbMock.result([{ id: "b-2", ...input }]);

      await expect(createBranch(input)).resolves.toMatchObject({ code: "RBK" });
      expect(dbMock.callsFor("values")[0].args).toEqual([input]);
    });
  });
});
