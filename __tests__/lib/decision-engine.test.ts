import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock database
vi.mock("@/db", () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      // Mirror the real engine: the computed status is set on the inserted row,
      // and `returning()` resolves it back to the caller.
      values: vi.fn().mockImplementation((values) => ({
        returning: vi.fn().mockResolvedValue([{ id: "test-id", ...values }]),
      })),
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{
            id: "test-id",
            status: "approved",
            targetModule: "workflow",
            targetAction: "advance_stage",
            targetPayload: {},
          }]),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{
            id: "test-id",
            status: "executed",
          }]),
        }),
      }),
    }),
  },
}));

// Mock audit
vi.mock("@/lib/audit", () => ({
  recordAudit: vi.fn().mockResolvedValue(undefined),
}));

// Mock events
vi.mock("@/lib/events", () => ({
  publishEvent: vi.fn().mockResolvedValue(undefined),
}));

import {
  evaluateRules,
  proposeDecision,
  approveDecision,
  rejectDecision,
  executeDecision,
  DECISION_STATUS,
} from "@/lib/decision-engine";

describe("Decision Engine", () => {
  describe("evaluateRules", () => {
    it("should pass valid workflow decisions", () => {
      const results = evaluateRules({
        agent: "workflow-agent",
        recommendation: "Advance study",
        targetModule: "workflow",
        targetAction: "advance_stage",
      });

      expect(results.every((r) => r.passed)).toBe(true);
    });

    it("should block report auto-signing", () => {
      const results = evaluateRules({
        agent: "reporting-agent",
        recommendation: "Sign report",
        targetModule: "reports",
        targetAction: "sign",
      });

      const reportRule = results.find((r) => r.rule === "no_auto_finalise_reports");
      expect(reportRule?.passed).toBe(false);
    });

    it("should block autonomous diagnosis", () => {
      const results = evaluateRules({
        agent: "ai-agent",
        recommendation: "Set diagnosis",
        targetModule: "reports",
        targetAction: "set_diagnosis",
      });

      const diagRule = results.find((r) => r.rule === "no_autonomous_diagnosis");
      expect(diagRule?.passed).toBe(false);
    });

    it("should allow STAT only in scheduling/workflow", () => {
      const validResults = evaluateRules({
        agent: "scheduling-agent",
        recommendation: "Urgent slot",
        priority: "stat",
        targetModule: "scheduling",
      });

      expect(validResults.every((r) => r.passed)).toBe(true);

      const invalidResults = evaluateRules({
        agent: "inventory-agent",
        recommendation: "Order supplies",
        priority: "stat",
        targetModule: "inventory",
      });

      const statRule = invalidResults.find((r) => r.rule === "stat_priority_allowed");
      expect(statRule?.passed).toBe(false);
    });
  });

  describe("DECISION_STATUS", () => {
    it("should have all required statuses", () => {
      expect(DECISION_STATUS.PROPOSED).toBe("proposed");
      expect(DECISION_STATUS.VALIDATED).toBe("validated");
      expect(DECISION_STATUS.APPROVED).toBe("approved");
      expect(DECISION_STATUS.REJECTED).toBe("rejected");
      expect(DECISION_STATUS.EXECUTED).toBe("executed");
      expect(DECISION_STATUS.FAILED).toBe("failed");
    });
  });

  describe("proposeDecision", () => {
    it("should propose a validated decision", async () => {
      const decision = await proposeDecision({
        agent: "workflow-agent",
        recommendation: "Advance study to imaging",
        targetModule: "workflow",
        targetAction: "advance_stage",
      });

      expect(decision.status).toBe("validated");
    });

    it("should propose with proposed status when rules fail", async () => {
      const decision = await proposeDecision({
        agent: "reporting-agent",
        recommendation: "Sign report",
        targetModule: "reports",
        targetAction: "sign",
      });

      expect(decision.status).toBe("proposed");
    });
  });
});
