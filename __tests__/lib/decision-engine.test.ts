import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/db", async () => {
  const { dbMock } = await import("../helpers/db-mock");
  return { db: dbMock.db };
});

// Mock audit
vi.mock("@/lib/audit", () => ({
  recordAudit: vi.fn().mockResolvedValue(undefined),
  recordAuditInTransaction: vi.fn().mockResolvedValue(undefined),
}));

// Mock events
vi.mock("@/lib/events", () => ({
  publishEvent: vi.fn().mockResolvedValue(undefined),
  recordEventInTransaction: vi.fn().mockResolvedValue(undefined),
}));

import { dbMock } from "../helpers/db-mock";
import {
  evaluateRules,
  proposeDecision,
  approveDecision,
  rejectDecision,
  executeDecision,
  DECISION_STATUS,
} from "@/lib/decision-engine";

beforeEach(() => {
  dbMock.reset();
  vi.clearAllMocks();
});

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
    it("should propose a validated decision atomically (tx + audit + event)", async () => {
      dbMock.result([{ id: "test-id", status: "validated", agent: "workflow-agent" }]);

      const decision = await proposeDecision({
        agent: "workflow-agent",
        recommendation: "Advance study to imaging",
        targetModule: "workflow",
        targetAction: "advance_stage",
      });

      expect(decision.status).toBe("validated");
      // One transaction wraps the insert; audit + event ride along (ADR-010).
      expect(dbMock.callsFor("transaction")).toHaveLength(1);
      expect(dbMock.callsFor("tx.insert")).toHaveLength(1);
    });

    it("should propose with proposed status when rules fail", async () => {
      dbMock.result([{ id: "test-id", status: "proposed", agent: "reporting-agent" }]);

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
