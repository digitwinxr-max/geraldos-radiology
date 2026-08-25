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
import {
  DECISION_STATUS,
  approveDecision,
  evaluateRules,
  executeDecision,
  getDecision,
  listDecisions,
  proposeDecision,
  rejectDecision,
} from "@/services/decisions-service";

beforeEach(() => dbMock.reset());

describe("decisions service", () => {
  it("re-exports the decision engine surface", () => {
    expect(typeof proposeDecision).toBe("function");
    expect(typeof approveDecision).toBe("function");
    expect(typeof rejectDecision).toBe("function");
    expect(typeof executeDecision).toBe("function");
    expect(typeof listDecisions).toBe("function");
    expect(typeof evaluateRules).toBe("function");
    expect(DECISION_STATUS).toBeDefined();
  });

  it("getDecision returns the recommendation row when found", async () => {
    dbMock.result([{ id: "d-1", status: "proposed", targetModule: "workflow" }]);

    await expect(getDecision("d-1")).resolves.toMatchObject({
      id: "d-1",
      status: "proposed",
    });
    expect(dbMock.callsFor("where")).toHaveLength(1);
  });

  it("getDecision returns null when the recommendation does not exist", async () => {
    dbMock.result([]);

    await expect(getDecision("missing")).resolves.toBeNull();
  });
});
