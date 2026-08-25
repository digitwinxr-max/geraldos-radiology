import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { reportVersions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { withAuth } from "@/lib/middleware-helpers";
import { internalError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

/** GET /api/reports/[id]/versions — full version history for a report. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(request, "reports.read", async () => {
    const { id } = await params;
    try {
      const versions = await db
        .select()
        .from(reportVersions)
        .where(eq(reportVersions.reportId, id))
        .orderBy(reportVersions.version);
      return NextResponse.json({ ok: true, versions });
    } catch {
      return internalError();
    }
  });
}
