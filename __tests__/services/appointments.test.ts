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
  checkInAppointment,
  createAppointment,
  listAppointments,
} from "@/services/appointments";

beforeEach(() => {
  dbMock.reset();
  vi.clearAllMocks();
});

const appointmentInput = {
  patientId: "p-1",
  scheduledDate: "2026-01-15",
  scheduledTime: "09:30:00",
  modality: "CT",
  procedure: "Chest CT",
};

describe("appointments service", () => {
  describe("listAppointments", () => {
    it("returns rows and total, joining patient/equipment/staff", async () => {
      dbMock.result([{ id: "a-1", patientLastName: "Lee" }]);
      dbMock.result([{ count: 3 }]);

      const res = await listAppointments({ limit: 50, offset: 0, dir: "desc" });

      expect(res.rows).toHaveLength(1);
      expect(res.total).toBe(3);
      expect(dbMock.callsFor("leftJoin")).toHaveLength(3);
    });

    it("passes limit/offset through to the paged query", async () => {
      dbMock.result([]);
      dbMock.result([{ count: 0 }]);

      await listAppointments({ limit: 25, offset: 75, dir: "desc" });

      expect(dbMock.callsFor("limit")[0].args).toEqual([25]);
      expect(dbMock.callsFor("offset")[0].args).toEqual([75]);
    });

    it("orders by scheduled date then time by default", async () => {
      dbMock.result([]);
      dbMock.result([{ count: 0 }]);

      await listAppointments({ limit: 50, offset: 0, dir: "desc" });

      // Default ordering passes two columns (date desc, time asc) to orderBy.
      expect(dbMock.callsFor("orderBy")[0].args).toHaveLength(2);
    });
  });

  describe("createAppointment", () => {
    it("inserts, audits and publishes appointment.created", async () => {
      const row = { id: "a-1", ...appointmentInput };
      dbMock.result([row]);

      const created = await createAppointment(appointmentInput);

      expect(created).toEqual(row);
      expect(dbMock.callsFor("values")[0].args).toEqual([appointmentInput]);
      expect(recordAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "appointment.created",
          module: "scheduling",
          entityType: "appointment",
          entityId: "a-1",
        }),
      );
      expect(publishEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: EVENT_TYPES.APPOINTMENT_CREATED,
          aggregate: "appointment",
          aggregateId: "a-1",
        }),
      );
    });
  });

  describe("checkInAppointment", () => {
    it("marks the appointment checked in, audits and publishes the event", async () => {
      const row = { id: "a-1", checkedIn: true, status: "checked_in" };
      dbMock.result([row]);

      const res = await checkInAppointment("a-1");

      expect(res).toEqual(row);
      const setArgs = dbMock.callsFor("set")[0].args[0] as Record<string, unknown>;
      expect(setArgs.checkedIn).toBe(true);
      expect(setArgs.status).toBe("checked_in");
      expect(recordAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "appointment.checked_in",
          entityType: "appointment",
          entityId: "a-1",
        }),
      );
      expect(publishEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: EVENT_TYPES.APPOINTMENT_CHECKED_IN,
          aggregateId: "a-1",
        }),
      );
    });

    it("returns null without side effects when the appointment is missing", async () => {
      dbMock.result([]);

      await expect(checkInAppointment("missing")).resolves.toBeNull();
      expect(recordAudit).not.toHaveBeenCalled();
      expect(publishEvent).not.toHaveBeenCalled();
    });
  });
});
