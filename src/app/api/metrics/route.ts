import { NextResponse } from "next/server";
import { metricsSnapshot } from "@/lib/metrics";

export const dynamic = "force-dynamic";

/**
 * GET /api/metrics — in-memory request metrics for container monitoring.
 * Exempt from auth (scraped by orchestrators alongside /api/health).
 */
export async function GET() {
  return NextResponse.json(metricsSnapshot());
}
