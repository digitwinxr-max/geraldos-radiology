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
import { publishEvent } from "@/lib/events";
import {
  createNotification,
  getNotification,
  listNotifications,
  markNotificationRead,
} from "@/services/notifications-service";

beforeEach(() => {
  dbMock.reset();
  vi.clearAllMocks();
});

describe("notifications service", () => {
  describe("listNotifications", () => {
    it("surfaces unread notifications first, with unread and total counts", async () => {
      // Promise.all order: recent window, unread rows, unread count, total.
      dbMock.result([
        { id: "n-1", read: true },
        { id: "n-2", read: false },
        { id: "n-3", read: true },
      ]);
      dbMock.result([{ id: "n-2", read: false }]);
      dbMock.result([{ count: "2" }]);
      dbMock.result([{ count: 3 }]);

      const res = await listNotifications({ limit: 10, offset: 0, dir: "desc" });

      expect(res.notifications.map((n) => n.id)).toEqual(["n-2", "n-1", "n-3"]);
      expect(res.unread).toBe(2); // string count coerced to number
      expect(res.total).toBe(3);
    });

    it("caps the recent window at 200 rows", async () => {
      dbMock.result([]);
      dbMock.result([]);
      dbMock.result([{ count: 0 }]);
      dbMock.result([{ count: 0 }]);

      await listNotifications({ limit: 50, offset: 190, dir: "desc" });

      // window = 240 → clamped to 200 for both the recent and unread queries.
      const limits = dbMock.callsFor("limit");
      expect(limits).toHaveLength(2);
      expect(limits[0].args).toEqual([200]);
      expect(limits[1].args).toEqual([200]);
    });

    it("slices the merged list by offset/limit", async () => {
      dbMock.result([
        { id: "n-1", read: true },
        { id: "n-2", read: true },
        { id: "n-3", read: true },
      ]);
      dbMock.result([]);
      dbMock.result([{ count: 0 }]);
      dbMock.result([{ count: 3 }]);

      const res = await listNotifications({ limit: 1, offset: 1, dir: "desc" });

      expect(res.notifications.map((n) => n.id)).toEqual(["n-2"]);
    });
  });

  describe("createNotification", () => {
    it("inserts the notification and publishes notification.sent", async () => {
      const input = { title: "Study assigned" };
      dbMock.result([{ id: "n-1", ...input }]);

      const row = await createNotification(input);

      expect(row).toMatchObject({ id: "n-1" });
      expect(publishEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "notification.sent",
          aggregate: "notification",
          aggregateId: "n-1",
          payload: { title: "Study assigned" },
        }),
      );
    });
  });

  it("markNotificationRead returns the updated row or null", async () => {
    dbMock.result([{ id: "n-1", read: true }]);
    const marked = await markNotificationRead("n-1");
    expect(marked).toMatchObject({ read: true });
    const setArgs = dbMock.callsFor("set")[0].args[0] as Record<string, unknown>;
    expect(setArgs.read).toBe(true);

    dbMock.reset();
    dbMock.result([]);
    await expect(markNotificationRead("missing")).resolves.toBeNull();
  });

  it("getNotification returns the row or null", async () => {
    dbMock.result([{ id: "n-1" }]);
    await expect(getNotification("n-1")).resolves.toMatchObject({ id: "n-1" });

    dbMock.reset();
    dbMock.result([]);
    await expect(getNotification("missing")).resolves.toBeNull();
  });
});
