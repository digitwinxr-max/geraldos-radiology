import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const startedAtMs = Date.now();

/**
 * GET /api/health — enriched healthcheck for load balancers and container
 * orchestrators. Exempt from auth. Reports DB probe latency, process uptime
 * and memory alongside the liveness flag.
 */
export async function GET() {
  const checkedAt = new Date().toISOString();
  const uptimeSec = Math.round((Date.now() - startedAtMs) / 1000);
  const memoryRssMB = Math.round(process.memoryUsage().rss / 1024 / 1024);

  const probeStart = Date.now();
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({
      ok: true,
      checkedAt,
      uptimeSec,
      db: { ok: true, latencyMs: Date.now() - probeStart },
      memoryRssMB,
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        checkedAt,
        uptimeSec,
        db: { ok: false, latencyMs: Date.now() - probeStart },
        memoryRssMB,
        error: { code: "UNHEALTHY", message: "Database unavailable" },
      },
      { status: 500 },
    );
  }
}
