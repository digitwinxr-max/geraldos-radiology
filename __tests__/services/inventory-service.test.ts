import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", async () => {
  const { dbMock } = await import("../helpers/db-mock");
  return { db: dbMock.db };
});
vi.mock("@/lib/events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/events")>();
  return { ...actual, publishEvent: vi.fn().mockResolvedValue(undefined) };
});

import { dbMock } from "../helpers/db-mock";
import { EVENT_TYPES, publishEvent } from "@/lib/events";
import {
  adjustStock,
  createInventoryItem,
  getInventoryItem,
  listInventory,
  listTransactions,
} from "@/services/inventory-service";

beforeEach(() => {
  dbMock.reset();
  vi.clearAllMocks();
});

describe("inventory service", () => {
  it("listInventory returns rows and total with pagination pass-through", async () => {
    dbMock.result([{ id: "inv-1", name: "Gloves" }]);
    dbMock.result([{ count: 8 }]);

    const res = await listInventory({ limit: 20, offset: 40, dir: "desc" });

    expect(res.total).toBe(8);
    expect(dbMock.callsFor("limit")[0].args).toEqual([20]);
    expect(dbMock.callsFor("offset")[0].args).toEqual([40]);
  });

  it("createInventoryItem inserts and returns the row", async () => {
    const input = { name: "Gloves", category: "consumables" };
    dbMock.result([{ id: "inv-1", ...input }]);

    await expect(createInventoryItem(input)).resolves.toMatchObject({ id: "inv-1" });
    expect(dbMock.callsFor("values")[0].args).toEqual([input]);
  });

  it("getInventoryItem returns the row or null", async () => {
    dbMock.result([{ id: "inv-1" }]);
    await expect(getInventoryItem("inv-1")).resolves.toMatchObject({ id: "inv-1" });

    dbMock.reset();
    dbMock.result([]);
    await expect(getInventoryItem("missing")).resolves.toBeNull();
  });

  describe("adjustStock", () => {
    it("returns null without side effects when the item is missing", async () => {
      dbMock.result([]);

      await expect(adjustStock("missing", -2, "usage", "user-1")).resolves.toBeNull();
      expect(dbMock.callsFor("insert")).toHaveLength(0);
      expect(publishEvent).not.toHaveBeenCalled();
    });

    it("records a transaction and publishes inventory.updated", async () => {
      dbMock.result([{ id: "inv-1", name: "Gloves", currentStock: 10, minimumStock: 2 }]);
      dbMock.result([{}]); // transaction insert (awaited, no returning)

      const res = await adjustStock("inv-1", -2, "usage", "user-1");

      expect(res).toMatchObject({ id: "inv-1", currentStock: 10 });
      expect(dbMock.callsFor("insert")).toHaveLength(1);
      expect(dbMock.callsFor("values")[0].args).toEqual([
        { itemId: "inv-1", type: "usage", quantity: -2, performedBy: "user-1" },
      ]);
      expect(publishEvent).toHaveBeenCalledTimes(1);
      expect(publishEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: EVENT_TYPES.INVENTORY_UPDATED,
          aggregate: "inventory",
          aggregateId: "inv-1",
          payload: { type: "usage", quantity: -2, currentStock: 10 },
        }),
      );
    });

    it("publishes a low-stock event before inventory.updated when stock is at or below minimum", async () => {
      dbMock.result([{ id: "inv-1", name: "Contrast", currentStock: 1, minimumStock: 5 }]);
      dbMock.result([{}]);

      await adjustStock("inv-1", -4, "usage", "user-1");

      expect(publishEvent).toHaveBeenCalledTimes(2);
      const types = vi.mocked(publishEvent).mock.calls.map((c) => c[0].type);
      expect(types).toEqual([EVENT_TYPES.INVENTORY_LOW_STOCK, EVENT_TYPES.INVENTORY_UPDATED]);
      expect(publishEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: EVENT_TYPES.INVENTORY_LOW_STOCK,
          payload: { name: "Contrast", currentStock: 1, minimumStock: 5 },
        }),
      );
    });
  });

  it("listTransactions filters by item when an id is given", async () => {
    dbMock.result([{ id: "tx-1" }]);
    await listTransactions("inv-1");
    expect(dbMock.callsFor("where")).toHaveLength(1);

    dbMock.reset();
    dbMock.result([]);
    await listTransactions();
    expect(dbMock.callsFor("where")).toHaveLength(0);
  });
});
