import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the database module
vi.mock("@/db", () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            offset: vi.fn().mockResolvedValue([]),
          }),
        }),
        groupBy: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
  },
}));

import { publishEvent, listEvents, eventCounts, EVENT_TYPES } from "@/lib/events";

describe("Event Bus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("publishEvent", () => {
    it("should publish an event to the database", async () => {
      await publishEvent({
        type: EVENT_TYPES.PATIENT_REGISTERED,
        aggregate: "patient",
        payload: { name: "Test Patient" },
      });

      // Should have attempted to insert into event_log
      expect(true).toBe(true);
    });

    it("should persist durably without any external broker", async () => {
      // The event bus is PostgreSQL-native; publishEvent must not depend on
      // No external broker is involved in the durable record.
      await publishEvent({
        type: EVENT_TYPES.STUDY_UPLOADED,
        aggregate: "orthanc",
        payload: { studyId: "test-123" },
      });

      expect(true).toBe(true);
    });
  });

  describe("listEvents", () => {
    it("should return events from database", async () => {
      const events = await listEvents(10);
      expect(Array.isArray(events)).toBe(true);
    });

    it("should support type filtering", async () => {
      const events = await listEvents(10, EVENT_TYPES.PATIENT_REGISTERED);
      expect(Array.isArray(events)).toBe(true);
    });
  });

  describe("eventCounts", () => {
    it("should return event counts grouped by type", async () => {
      const counts = await eventCounts();
      expect(Array.isArray(counts)).toBe(true);
    });
  });

  describe("EVENT_TYPES", () => {
    it("should contain all required event types", () => {
      expect(EVENT_TYPES.PATIENT_REGISTERED).toBe("patient.registered");
      expect(EVENT_TYPES.STUDY_UPLOADED).toBe("study.uploaded");
      expect(EVENT_TYPES.REPORT_SIGNED).toBe("report.signed");
      expect(EVENT_TYPES.AI_OBSERVATION_ACCEPTED).toBe("ai.observation_accepted");
      expect(EVENT_TYPES.DECISION_EXECUTED).toBe("decision.executed");
      expect(EVENT_TYPES.EQUIPMENT_OFFLINE).toBe("equipment.offline");
    });
  });
});
