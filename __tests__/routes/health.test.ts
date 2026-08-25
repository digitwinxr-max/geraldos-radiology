import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  execute: vi.fn(),
}));
vi.mock("@/db", () => ({ db: dbMock }));

import { GET } from "@/app/api/health/route";

beforeEach(() => {
  dbMock.execute.mockReset();
});

describe("GET /api/health", () => {
  it("reports an enriched healthy payload when the DB probe succeeds", async () => {
    dbMock.execute.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.db).toEqual({ ok: true, latencyMs: expect.any(Number) });
    expect(body.uptimeSec).toBeGreaterThanOrEqual(0);
    expect(body.memoryRssMB).toBeGreaterThan(0);
    expect(new Date(body.checkedAt).toISOString()).toBe(body.checkedAt);
  });

  it("keeps the 500 UNHEALTHY envelope when the DB probe fails", async () => {
    dbMock.execute.mockRejectedValueOnce(new Error("connection refused"));

    const res = await GET();

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.db.ok).toBe(false);
    expect(body.db.latencyMs).toBeGreaterThanOrEqual(0);
    expect(body.error).toEqual({ code: "UNHEALTHY", message: "Database unavailable" });
  });
});
