import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/db", async () => {
  const { dbMock } = await import("../helpers/db-mock");
  return { db: dbMock.db };
});
vi.mock("@/lib/audit", () => ({
  recordAudit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/middleware-helpers", () => ({
  withAuth: vi.fn(),
}));
vi.mock("@/lib/workflow", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/workflow")>();
  return { ...actual, transitionStudy: vi.fn() };
});

import { dbMock, mockUser } from "../helpers/db-mock";
import { recordAudit } from "@/lib/audit";
import { withAuth } from "@/lib/middleware-helpers";
import { transitionStudy } from "@/lib/workflow";
import { PATCH } from "@/app/api/workflow/[id]/route";

const RADIOLOGIST_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

function patchRequest(body: string) {
  return new NextRequest("http://localhost/api/workflow/s-1", {
    method: "PATCH",
    body,
    headers: { "content-type": "application/json" },
  });
}

function call(body: string) {
  return PATCH(patchRequest(body), { params: Promise.resolve({ id: "s-1" }) });
}

beforeEach(() => {
  dbMock.reset();
  vi.clearAllMocks();
  vi.mocked(withAuth).mockImplementation(async (_req, _permission, handler) => handler(mockUser));
});

describe("PATCH /api/workflow/[id]", () => {
  it("rejects a malformed body with 400 VALIDATION_FAILED", async () => {
    const res = await call("{not json");

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
    expect(dbMock.calls).toHaveLength(0);
  });

  it("returns 404 when the study does not exist", async () => {
    dbMock.result([]);

    const res = await call(JSON.stringify({ action: "transition", to: "appointment" }));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  describe("assign action", () => {
    it("requires a radiologistId", async () => {
      dbMock.result([{ id: "s-1", stage: "study_created" }]);

      const res = await call(JSON.stringify({ action: "assign" }));

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.message).toContain("radiologistId is required");
      expect(transitionStudy).not.toHaveBeenCalled();
    });

    it("re-assigns without a stage change when the study is past assigned", async () => {
      dbMock.result([{ id: "s-1", stage: "opened" }]);
      dbMock.result([{ id: "s-1", stage: "opened", radiologistId: RADIOLOGIST_ID }]);

      const res = await call(JSON.stringify({ action: "assign", radiologistId: RADIOLOGIST_ID }));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({ ok: true, transitioned: false, reassigned: true });
      expect(transitionStudy).not.toHaveBeenCalled();
      const setArgs = dbMock.callsFor("set")[0].args[0] as Record<string, unknown>;
      expect(setArgs.radiologistId).toBe(RADIOLOGIST_ID);
      expect(recordAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: "workflow.reassigned", userId: "test-user" }),
      );
    });

    it("transitions to assigned for an early-stage study", async () => {
      dbMock.result([{ id: "s-1", stage: "study_created" }]);
      vi.mocked(transitionStudy).mockResolvedValue({
        ok: true,
        study: { id: "s-1", stage: "assigned" } as never,
        fromStage: "study_created",
        toStage: "assigned",
        transitioned: true,
      });

      const res = await call(JSON.stringify({ action: "assign", radiologistId: RADIOLOGIST_ID }));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({
        ok: true,
        transitioned: true,
        fromStage: "study_created",
        toStage: "assigned",
      });
      expect(transitionStudy).toHaveBeenCalledWith({
        studyId: "s-1",
        to: "assigned",
        radiologistId: RADIOLOGIST_ID,
        changedBy: "test-user",
      });
    });

    it("honours an explicit changedBy over the session user", async () => {
      dbMock.result([{ id: "s-1", stage: "study_created" }]);
      vi.mocked(transitionStudy).mockResolvedValue({ ok: true, transitioned: true });

      await call(
        JSON.stringify({ action: "assign", radiologistId: RADIOLOGIST_ID, changedBy: "reception-1" }),
      );

      expect(transitionStudy).toHaveBeenCalledWith(
        expect.objectContaining({ changedBy: "reception-1" }),
      );
    });
  });

  describe("transition action", () => {
    it("rejects an unknown stage, listing the valid keys", async () => {
      dbMock.result([{ id: "s-1", stage: "referral" }]);

      const res = await call(JSON.stringify({ action: "transition", to: "diagnosed" }));

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_FAILED");
      expect(body.error.message).toContain("referral");
      expect(body.error.message).toContain("archived");
      expect(transitionStudy).not.toHaveBeenCalled();
    });

    it("accepts the legacy stage alias", async () => {
      dbMock.result([{ id: "s-1", stage: "referral" }]);
      vi.mocked(transitionStudy).mockResolvedValue({ ok: true, transitioned: true });

      await call(JSON.stringify({ stage: "appointment" }));

      expect(transitionStudy).toHaveBeenCalledWith(
        expect.objectContaining({ to: "appointment" }),
      );
    });

    it("surfaces a state-machine failure as WORKFLOW_ERROR with its status", async () => {
      dbMock.result([{ id: "s-1", stage: "opened" }]);
      vi.mocked(transitionStudy).mockResolvedValue({
        ok: false,
        status: 409,
        error: 'Cannot move study from "Study Opened" backwards to "Appointment"',
      });

      const res = await call(JSON.stringify({ action: "transition", to: "appointment" }));

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error.code).toBe("WORKFLOW_ERROR");
      expect(body.error.message).toContain("backwards");
    });

    it("returns the transition result on success", async () => {
      dbMock.result([{ id: "s-1", stage: "referral" }]);
      vi.mocked(transitionStudy).mockResolvedValue({
        ok: true,
        study: { id: "s-1", stage: "appointment" } as never,
        fromStage: "referral",
        toStage: "appointment",
        transitioned: true,
      });

      const res = await call(JSON.stringify({ action: "transition", to: "appointment" }));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({
        ok: true,
        transitioned: true,
        fromStage: "referral",
        toStage: "appointment",
      });
      expect(body.study.stage).toBe("appointment");
    });
  });

  describe("plain field updates", () => {
    it("updates allowlisted fields without a stage change", async () => {
      dbMock.result([{ id: "s-1", stage: "referral" }]);
      dbMock.result([{ id: "s-1", stage: "referral", priority: "stat" }]);

      const res = await call(JSON.stringify({ priority: "stat" }));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({ ok: true, transitioned: false });
      const setArgs = dbMock.callsFor("set")[0].args[0] as Record<string, unknown>;
      expect(setArgs.priority).toBe("stat");
      expect(setArgs.updatedAt).toBeInstanceOf(Date);
      expect(transitionStudy).not.toHaveBeenCalled();
      expect(recordAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: "workflow.updated", userId: "test-user" }),
      );
    });

    it("rejects an empty update", async () => {
      dbMock.result([{ id: "s-1", stage: "referral" }]);

      const res = await call(JSON.stringify({}));

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.message).toContain("no supported fields provided");
      expect(dbMock.callsFor("update")).toHaveLength(0);
    });
  });
});
