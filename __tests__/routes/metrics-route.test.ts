import { beforeEach, describe, expect, it } from "vitest";

import { GET } from "@/app/api/metrics/route";
import { recordRequest, resetMetricsForTesting } from "@/lib/metrics";

beforeEach(() => {
  resetMetricsForTesting();
});

describe("GET /api/metrics", () => {
  it("returns the metrics snapshot shape with uptime", async () => {
    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      requestsTotal: 0,
      errorsTotal: 0,
      byStatusClass: { "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0 },
      latencyBuckets: { "<100ms": 0, "100-500ms": 0, "500ms-2s": 0, ">=2s": 0 },
      byRoute: {},
    });
    expect(body.uptimeSec).toBeGreaterThanOrEqual(0);
    expect(typeof body.startedAt).toBe("string");
  });

  it("reflects requests recorded since startup", async () => {
    recordRequest("/api/patients", 200, 12);
    recordRequest("/api/patients", 500, 2500);

    const res = await GET();
    const body = await res.json();

    expect(body.requestsTotal).toBe(2);
    expect(body.errorsTotal).toBe(1);
    expect(body.byRoute["/api/patients"]).toBe(2);
    expect(body.latencyBuckets["<100ms"]).toBe(1);
    expect(body.latencyBuckets[">=2s"]).toBe(1);
  });
});
