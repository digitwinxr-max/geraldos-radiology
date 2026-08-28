import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  execute: vi.fn(),
}));
vi.mock("@/db", () => ({ db: dbMock }));

import { GET } from "@/app/api/health/route";

beforeEach(() => {
  dbMock.execute.mockReset();
  vi.unstubAllEnvs();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/health", () => {
  it("reports an enriched healthy payload when the DB probe succeeds", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost:5432/geraldos");
    dbMock.execute.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("healthy");
    expect(body.ok).toBe(true);
    expect(body.db).toEqual({ ok: true, latencyMs: expect.any(Number) });
    expect(body.uptimeSec).toBeGreaterThanOrEqual(0);
    expect(body.memoryRssMB).toBeGreaterThan(0);
    expect(new Date(body.checkedAt).toISOString()).toBe(body.checkedAt);
  });

  it("returns 200 degraded when DATABASE_URL is not set", async () => {
    vi.stubEnv("DATABASE_URL", "");

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.db).toEqual({ ok: false, latencyMs: 0, reason: "DATABASE_URL not set" });
    expect(body.status).toBe("degraded");
    // The route must not touch the database when DATABASE_URL is absent.
    expect(dbMock.execute).not.toHaveBeenCalled();
  });

  it("returns 503 UNHEALTHY when the DB probe fails", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost:5432/geraldos");
    dbMock.execute.mockRejectedValueOnce(new Error("connection refused"));

    const res = await GET();

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("unhealthy");
    expect(body.ok).toBe(true);
    expect(body.db.ok).toBe(false);
    expect(body.db.latencyMs).toBeGreaterThanOrEqual(0);
    expect(body.error).toEqual({ code: "DB_UNREACHABLE", message: "Database probe failed" });
  });
});
