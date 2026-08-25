import { beforeEach, describe, expect, it } from "vitest";

import { metricsSnapshot, recordRequest, resetMetricsForTesting } from "@/lib/metrics";

beforeEach(() => {
  resetMetricsForTesting();
});

describe("recordRequest / metricsSnapshot", () => {
  it("counts totals, status classes and per-route requests", () => {
    recordRequest("/api/patients", 200, 10);
    recordRequest("/api/patients", 404, 20);
    recordRequest("/api/workflow", 307, 30);
    recordRequest("/api/reports", 500, 40);

    const snap = metricsSnapshot();
    expect(snap.requestsTotal).toBe(4);
    expect(snap.errorsTotal).toBe(1);
    expect(snap.byStatusClass).toEqual({ "2xx": 1, "3xx": 1, "4xx": 1, "5xx": 1 });
    expect(snap.byRoute).toEqual({ "/api/patients": 2, "/api/workflow": 1, "/api/reports": 1 });
  });

  it("sorts durations into latency buckets at the documented boundaries", () => {
    recordRequest("/r", 200, 99); // <100ms
    recordRequest("/r", 200, 100); // 100-500ms
    recordRequest("/r", 200, 499); // 100-500ms
    recordRequest("/r", 200, 500); // 500ms-2s
    recordRequest("/r", 200, 1999); // 500ms-2s
    recordRequest("/r", 200, 2000); // >=2s

    expect(metricsSnapshot().latencyBuckets).toEqual({
      "<100ms": 1,
      "100-500ms": 2,
      "500ms-2s": 2,
      ">=2s": 1,
    });
  });

  it("ignores status classes outside 2xx-5xx but still counts the request", () => {
    recordRequest("/r", 101, 5);

    const snap = metricsSnapshot();
    expect(snap.requestsTotal).toBe(1);
    expect(snap.byStatusClass["2xx" as keyof typeof snap.byStatusClass]).toBe(0);
  });

  it("exposes uptime and a stable startedAt timestamp", () => {
    const snap = metricsSnapshot();
    expect(snap.uptimeSec).toBeGreaterThanOrEqual(0);
    expect(new Date(snap.startedAt).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("resetMetricsForTesting zeroes every counter", () => {
    recordRequest("/r", 200, 10);
    resetMetricsForTesting();

    const snap = metricsSnapshot();
    expect(snap.requestsTotal).toBe(0);
    expect(snap.errorsTotal).toBe(0);
    expect(snap.byRoute).toEqual({});
    expect(snap.latencyBuckets["<100ms"]).toBe(0);
  });
});
