import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — enriched healthcheck for load balancers and container
 * orchestrators. Exempt from auth. Reports DB probe latency, process uptime
 * and memory alongside the liveness flag.
 *
 * Returns 200 when the process is alive (liveness) even if the DB is down.
 * Returns 503 when the DB is unreachable (readiness) so Render's health
 * check can distinguish "process alive but not ready" from "process dead".
 */
const startedAtMs = Date.now();

export async function GET() {
  const checkedAt = new Date().toISOString();
  const uptimeSec = Math.round((Date.now() - startedAtMs) / 1000);
  const memoryRssMB = Math.round(process.memoryUsage().rss / 1024 / 1024);
  const pid = process.pid;

  // ── Liveness: is the Node process alive? ──
  // Always 200 — Render uses this to know the container hasn't crashed.
  const base = { ok: true as const, checkedAt, uptimeSec, memoryRssMB, pid };

  // ── Readiness: can we reach the database? ──
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { ...base, db: { ok: false, latencyMs: 0, reason: "DATABASE_URL not set" },
        status: "degraded" },
      { status: 200 },
    );
  }

  const probeStart = Date.now();
  try {
    // Lazy import avoids module-level db access that would throw when
    // DATABASE_URL is missing during build or cold start.
    const { db } = await import("@/db");
    await db.execute(sql`select 1`);
    return NextResponse.json({
      ...base,
      db: { ok: true, latencyMs: Date.now() - probeStart },
      status: "healthy",
    });
  } catch (error) {
    return NextResponse.json(
      { ...base,
        db: { ok: false, latencyMs: Date.now() - probeStart },
        status: "unhealthy",
        error: { code: "DB_UNREACHABLE", message: "Database probe failed" },
      },
      { status: 503 },
    );
  }
}
