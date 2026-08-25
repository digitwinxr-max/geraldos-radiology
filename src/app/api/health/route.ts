import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — basic healthcheck. Exempt from auth (used by load balancers
 * and container orchestrators to probe liveness).
 */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: { code: "UNHEALTHY", message: "Database unavailable" } }, { status: 500 });
  }
}
