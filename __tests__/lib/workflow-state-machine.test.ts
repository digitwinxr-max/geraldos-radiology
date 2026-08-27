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
  isWorkflowStage,
  nextStageOf,
  nextStagesOf,
  stageIndex,
  stageLabel,
  transitionStudy,
} from "@/lib/workflow";

beforeEach(() => {
  dbMock.reset();
  vi.clearAllMocks();
});

/** Script the study lookup that opens every transitionStudy call. */
function scriptStudy(stage: string, extra: Record<string, unknown> = {}) {
  dbMock.result([{ id: "s-1", stage, accessionNumber: "ACC-1", modality: "CT", procedure: "Chest CT", ...extra }]);
}

/** Script the update().returning() that persists a successful transition. */
function scriptUpdated(stage: string, extra: Record<string, unknown> = {}) {
  dbMock.result([{ id: "s-1", stage, accessionNumber: "ACC-1", modality: "CT", procedure: "Chest CT", ...extra }]);
}

describe("workflow state machine", () => {
  describe("pure helpers", () => {
    it("models the 12-stage pipeline in clinical order", () => {
      expect(WORKFLOW_STAGES.map((s) => s.key)).toEqual([
        "referral",
        "appointment",
        "arrival",
        "study_created",
        "sent_to_orthanc",
        "assigned",
        "opened",
        "review",
        "report_draft",
        "signed",
        "released",
        "archived",
      ]);
      // Every stage carries a label and a domain event.
      for (const stage of WORKFLOW_STAGES) {
        expect(stage.label).toBeTruthy();
        expect(stage.event).toBeTruthy();
      }
    });

    it("isWorkflowStage accepts pipeline keys only", () => {
      expect(isWorkflowStage("referral")).toBe(true);
      expect(isWorkflowStage("archived")).toBe(true);
      expect(isWorkflowStage("diagnosed")).toBe(false);
      expect(isWorkflowStage("")).toBe(false);
    });

    it("stageIndex returns position or -1 for unknown stages", () => {
      expect(stageIndex("referral")).toBe(0);
      expect(stageIndex("archived")).toBe(11);
      expect(stageIndex("unknown")).toBe(-1);
    });

    it("stageLabel maps keys to human-readable labels, passing unknown keys through", () => {
      expect(stageLabel("sent_to_orthanc")).toBe("Sent to Orthanc");
      expect(stageLabel("report_draft")).toBe("Report Draft");
      expect(stageLabel("not_a_stage")).toBe("not_a_stage");
    });

    it("nextStagesOf returns strictly later stages", () => {
      expect(nextStagesOf("signed")).toEqual(["released", "archived"]);
      expect(nextStagesOf("archived")).toEqual([]);
      expect(nextStagesOf("bogus")).toEqual([]);
      expect(nextStagesOf("referral")).toHaveLength(11);
    });

    it("nextStageOf returns the immediate successor and null at the end", () => {
      expect(nextStageOf("referral")).toBe("appointment");
      expect(nextStageOf("report_draft")).toBe("signed");
      expect(nextStageOf("archived")).toBeNull();
      expect(nextStageOf("bogus")).toBeNull();
    });
  });

  describe("transitionStudy guards", () => {
    it("rejects an unknown target stage with 400", async () => {
      const res = await transitionStudy({ studyId: "s-1", to: "diagnosed" });

      expect(res).toMatchObject({ ok: false, status: 400 });
      expect(res.error).toContain("not a valid workflow stage");
      expect(dbMock.calls).toHaveLength(0); // no db round-trip at all
    });

    it("returns 404 when the study does not exist", async () => {
      dbMock.result([]);

      const res = await transitionStudy({ studyId: "missing", to: "appointment" });

      expect(res).toMatchObject({ ok: false, status: 404, error: "Study not found" });
    });

    it("rejects backward moves with 409", async () => {
      scriptStudy("opened");

      const res = await transitionStudy({ studyId: "s-1", to: "assigned" });

      expect(res).toMatchObject({ ok: false, status: 409 });
      expect(res.error).toContain("backwards");
    });

    it("returns transitioned: false for a same-stage no-op", async () => {
      scriptStudy("assigned");

      const res = await transitionStudy({ studyId: "s-1", to: "assigned" });

      expect(res).toMatchObject({ ok: true, transitioned: false, fromStage: "assigned", toStage: "assigned" });
      expect(dbMock.callsFor("tx.update")).toHaveLength(0);
      expect(recordAuditInTransaction).not.toHaveBeenCalled();
      expect(recordEventInTransaction).not.toHaveBeenCalled();
    });

    it("requires a studyInstanceUid before sent_to_orthanc", async () => {
      scriptStudy("study_created");

      const blocked = await transitionStudy({ studyId: "s-1", to: "sent_to_orthanc" });
      expect(blocked).toMatchObject({ ok: false, status: 400 });

      // Supplying the UID with the transition passes the guard.
      dbMock.reset();
      scriptStudy("study_created");
      scriptUpdated("sent_to_orthanc");
      const allowed = await transitionStudy({
        studyId: "s-1",
        to: "sent_to_orthanc",
        studyInstanceUid: "1.2.840.113619.2.55",
      });
      expect(allowed.ok).toBe(true);
      const setArgs = dbMock.callsFor("set")[0].args[0] as Record<string, unknown>;
      expect(setArgs.studyInstanceUid).toBe("1.2.840.113619.2.55");
    });

    it("requires a radiologist before assigned and opened", async () => {
      scriptStudy("sent_to_orthanc");
      const unassigned = await transitionStudy({ studyId: "s-1", to: "assigned" });
      expect(unassigned).toMatchObject({ ok: false, status: 400 });

      dbMock.reset();
      scriptStudy("assigned");
      const unopened = await transitionStudy({ studyId: "s-1", to: "opened" });
      expect(unopened).toMatchObject({ ok: false, status: 400 });

      // Passing a radiologistId with the transition satisfies both guards.
      dbMock.reset();
      scriptStudy("sent_to_orthanc");
      scriptUpdated("assigned");
      const ok = await transitionStudy({ studyId: "s-1", to: "assigned", radiologistId: "rad-1" });
      expect(ok.ok).toBe(true);
    });

    it("requires a signed report before the signed stage", async () => {
      scriptStudy("report_draft");
      dbMock.result([{ status: "draft" }]); // report lookup

      const res = await transitionStudy({ studyId: "s-1", to: "signed" });

      expect(res).toMatchObject({ ok: false, status: 400 });
      expect(res.error).toContain("signed");
    });

    it("requires a signed report before release", async () => {
      scriptStudy("report_draft");
      dbMock.result([{ status: "draft" }]);

      const res = await transitionStudy({ studyId: "s-1", to: "released" });

      expect(res).toMatchObject({ ok: false, status: 400 });
    });

    it("allows release from the signed stage even without re-checking the report row", async () => {
      scriptStudy("signed");
      dbMock.result([{ status: "draft" }]); // report not signed â€” but from === "signed"
      scriptUpdated("released");

      const res = await transitionStudy({ studyId: "s-1", to: "released" });

      expect(res.ok).toBe(true);
    });

    it("only archives studies coming from released", async () => {
      scriptStudy("signed");
      const blocked = await transitionStudy({ studyId: "s-1", to: "archived" });
      expect(blocked).toMatchObject({ ok: false, status: 400 });

      dbMock.reset();
      scriptStudy("released");
      scriptUpdated("archived");
      const allowed = await transitionStudy({ studyId: "s-1", to: "archived" });
      expect(allowed.ok).toBe(true);
    });
  });

  describe("transitionStudy success path", () => {
    it("writes the stage, audits, publishes the stage event plus worklist.updated", async () => {
      scriptStudy("appointment");
      scriptUpdated("arrival");

      const res = await transitionStudy({ studyId: "s-1", to: "arrival", changedBy: "user-1" });

      expect(res).toMatchObject({ ok: true, transitioned: true, fromStage: "appointment", toStage: "arrival" });
      expect(res.study).toMatchObject({ stage: "arrival" });

      const setArgs = dbMock.callsFor("set")[0].args[0] as Record<string, unknown>;
      expect(setArgs.stage).toBe("arrival");

      expect(recordAuditInTransaction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          userId: "user-1",
          action: "workflow.transition",
          module: "workflow",
          entityType: "workflow_study",
          entityId: "s-1",
          details: expect.objectContaining({ fromStage: "appointment", toStage: "arrival" }),
        }),
      );

      const types = vi.mocked(recordEventInTransaction).mock.calls.map((c) => (c[1] as { type: string }).type);
      expect(types).toEqual([EVENT_TYPES.APPOINTMENT_CHECKED_IN, EVENT_TYPES.WORKLIST_UPDATED]);
    });

    it("notifies the radiologist when a study is assigned", async () => {
      scriptStudy("sent_to_orthanc");
      scriptUpdated("assigned");
      dbMock.result([{}]); // notification insert (awaited, no returning)

      await transitionStudy({ studyId: "s-1", to: "assigned", radiologistId: "rad-1" });

      expect(dbMock.callsFor("tx.insert")).toHaveLength(1);
      const values = dbMock.callsFor("values")[0].args[0] as Record<string, unknown>;
      expect(values.userId).toBe("rad-1");
      expect(values.title).toBe("Study assigned to you");
      expect(recordEventInTransaction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ type: EVENT_TYPES.STUDY_ASSIGNED }),
      );
    });

    it("broadcasts a notification when a report is released", async () => {
      scriptStudy("signed");
      dbMock.result([{ status: "signed" }]); // report lookup
      scriptUpdated("released");
      dbMock.result([{}]); // notification insert

      await transitionStudy({ studyId: "s-1", to: "released" });

      const values = dbMock.callsFor("values")[0].args[0] as Record<string, unknown>;
      expect(values.userId).toBe("all");
      expect(values.title).toBe("Report released");
      const setArgs = dbMock.callsFor("set")[0].args[0] as Record<string, unknown>;
      expect(setArgs.completedAt).toBeInstanceOf(Date);
    });

    it("sets startedAt when opening a study that has not started", async () => {
      scriptStudy("assigned", { radiologistId: "rad-1", startedAt: null });
      scriptUpdated("opened");

      await transitionStudy({ studyId: "s-1", to: "opened" });

      const setArgs = dbMock.callsFor("set")[0].args[0] as Record<string, unknown>;
      expect(setArgs.startedAt).toBeInstanceOf(Date);
      expect(recordEventInTransaction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ type: EVENT_TYPES.STUDY_OPENED }),
      );
    });
  });
});
