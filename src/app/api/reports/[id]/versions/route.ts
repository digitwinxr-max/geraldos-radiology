import { NextResponse } from "next/server";
import { db } from "@/db";
import { reportVersions } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** GET /api/reports/[id]/versions — full version history for a report. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const versions = await db
      .select()
      .from(reportVersions)
      .where(eq(reportVersions.reportId, id))
      .orderBy(reportVersions.version);
    return NextResponse.json({ ok: true, versions });
  } catch (error) {
    return NextResponse.json({ ok: false, error: "failed to load versions", detail: String(error) }, { status: 500 });
  }
}
