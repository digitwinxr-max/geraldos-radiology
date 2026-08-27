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
import { recordAuditInTransaction } from "@/lib/audit";
import { EVENT_TYPES, recordEventInTransaction } from "@/lib/events";
import {
  WORKFLOW_STAGES,
  createWorkflowStudy,
  getWorkflowStudy,
  listWorkflowStudies,
  stageLabel,
  transitionStudy,
} from "@/services/workflow-service";

beforeEach(() => {
  dbMock.reset();
  vi.clearAllMocks();
});

describe("workflow service", () => {
  it("re-exports the state machine surface", () => {
    expect(typeof transitionStudy).toBe("function");
    expect(typeof stageLabel).toBe("function");
    expect(WORKFLOW_STAGES).toHaveLength(12);
  });

  describe("listWorkflowStudies", () => {
    it("returns rows joined with patient/radiologist, with totals", async () => {
      dbMock.result([{ id: "s-1", stage: "study_created" }]);
      dbMock.result([{ count: 4 }]);

      const res = await listWorkflowStudies({ limit: 50, offset: 0, dir: "desc" });

      expect(res.total).toBe(4);
      expect(res.rows[0]).toMatchObject({ id: "s-1", stage: "study_created" });
      expect(dbMock.callsFor("leftJoin")).toHaveLength(2);
      expect(dbMock.callsFor("limit")[0].args).toEqual([50]);
      expect(dbMock.callsFor("offset")[0].args).toEqual([0]);
    });

    it("decorates rows with the human-readable stage label", async () => {
      dbMock.result([{ id: "s-1", stage: "study_created" }]);
      dbMock.result([{ count: 1 }]);

      const res = await listWorkflowStudies({ limit: 50, offset: 0, dir: "desc" });

      expect(res.rows[0].stageLabel).toBe("Study Created");
    });

    it("falls back to the referral label when the stage is missing", async () => {
      dbMock.result([{ id: "s-1", stage: null }]);
      dbMock.result([{ count: 1 }]);

      const res = await listWorkflowStudies({ limit: 50, offset: 0, dir: "desc" });

      expect(res.rows[0].stageLabel).toBe("Referral");
    });
  });

  describe("createWorkflowStudy", () => {
    const input = { patientId: "p-1", modality: "MRI", procedure: "Brain MRI" };

    it("inserts the study atomically with audit + outbox events, and returns the row", async () => {
      const row = { id: "s-1", stage: "referral", ...input };
      dbMock.result([row]);

      await expect(createWorkflowStudy(input, "user-1")).resolves.toEqual(row);
      // Everything happens inside one transaction (ADR-010).
      expect(dbMock.callsFor("transaction")).toHaveLength(1);
      expect(dbMock.callsFor("tx.insert")).toHaveLength(1);
      expect(dbMock.callsFor("values")[0].args).toEqual([input]);
      expect(dbMock.callsFor("returning")).toHaveLength(1);
    });

    it("records an audit entry and queues study.created + worklist events", async () => {
      dbMock.result([{ id: "s-1", ...input }]);

      await createWorkflowStudy(input, "user-1");

      expect(recordAuditInTransaction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          userId: "user-1",
          action: "study.created",
          module: "workflow",
          entityType: "workflow_study",
          entityId: "s-1",
          details: { modality: "MRI", procedure: "Brain MRI" },
        }),
      );
      expect(recordEventInTransaction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          type: EVENT_TYPES.STUDY_CREATED,
          aggregate: "study",
          aggregateId: "s-1",
          payload: { modality: "MRI", procedure: "Brain MRI" },
        }),
      );
      expect(recordEventInTransaction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          type: EVENT_TYPES.WORKLIST_UPDATED,
          aggregateId: "s-1",
        }),
      );
    });
  });

  describe("getWorkflowStudy", () => {
    it("returns the study when found", async () => {
      dbMock.result([{ id: "s-1", stage: "assigned" }]);

      await expect(getWorkflowStudy("s-1")).resolves.toMatchObject({ id: "s-1" });
    });

    it("returns null when the study does not exist", async () => {
      dbMock.result([]);

      await expect(getWorkflowStudy("missing")).resolves.toBeNull();
    });
  });
});
