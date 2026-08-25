/**
 * GeraldOS — In-Memory Request Metrics
 *
 * Lightweight counters for container monitoring, fed by withAuth on every
 * authenticated request and exposed via GET /api/metrics. Deliberately
 * dependency-free: single-instance counters reset on restart, which is
 * exactly what a container orchestrator scrape expects.
 */

const startedAtMs = Date.now();

export const LATENCY_BUCKETS = ["<100ms", "100-500ms", "500ms-2s", ">=2s"] as const;
export const STATUS_CLASSES = ["2xx", "3xx", "4xx", "5xx"] as const;

interface MetricsState {
  requestsTotal: number;
  errorsTotal: number;
  byStatusClass: Record<(typeof STATUS_CLASSES)[number], number>;
  latencyBuckets: Record<(typeof LATENCY_BUCKETS)[number], number>;
  byRoute: Map<string, number>;
}

function freshState(): MetricsState {
  return {
    requestsTotal: 0,
    errorsTotal: 0,
    byStatusClass: { "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0 },
    latencyBuckets: { "<100ms": 0, "100-500ms": 0, "500ms-2s": 0, ">=2s": 0 },
    byRoute: new Map(),
  };
}

let state = freshState();

function latencyBucket(durationMs: number): (typeof LATENCY_BUCKETS)[number] {
  if (durationMs < 100) return "<100ms";
  if (durationMs < 500) return "100-500ms";
  if (durationMs < 2000) return "500ms-2s";
  return ">=2s";
}

/** Record one completed request. Called from withAuth. */
export function recordRequest(route: string, status: number, durationMs: number): void {
  state.requestsTotal += 1;
  if (status >= 500) state.errorsTotal += 1;

  const cls = `${Math.floor(status / 100)}xx`;
  if (cls in state.byStatusClass) {
    state.byStatusClass[cls as (typeof STATUS_CLASSES)[number]] += 1;
  }

  state.latencyBuckets[latencyBucket(durationMs)] += 1;
  state.byRoute.set(route, (state.byRoute.get(route) ?? 0) + 1);
}

export interface MetricsSnapshot {
  startedAt: string;
  uptimeSec: number;
  requestsTotal: number;
  errorsTotal: number;
  byStatusClass: Record<string, number>;
  latencyBuckets: Record<string, number>;
  byRoute: Record<string, number>;
}

/** Current counters as a plain JSON-serializable object. */
export function metricsSnapshot(): MetricsSnapshot {
  return {
    startedAt: new Date(startedAtMs).toISOString(),
    uptimeSec: Math.round((Date.now() - startedAtMs) / 1000),
    requestsTotal: state.requestsTotal,
    errorsTotal: state.errorsTotal,
    byStatusClass: { ...state.byStatusClass },
    latencyBuckets: { ...state.latencyBuckets },
    byRoute: Object.fromEntries(state.byRoute),
  };
}

/** Reset every counter. Test-only. */
export function resetMetricsForTesting(): void {
  state = freshState();
}
