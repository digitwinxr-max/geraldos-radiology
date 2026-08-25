import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { reportVersions } from "@/db/schema";
import { eq, count } from "drizzle-orm";
import { withAuth } from "@/lib/middleware-helpers";
import { internalError } from "@/lib/api-error";
import { parseListQuery, listEnvelope, serviceOpts } from "@/lib/list-query";

export const dynamic = "force-dynamic";

/** GET /api/reports/[id]/versions — full version history for a report. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(request, "reports.read", async () => {
    const parsed = parseListQuery(request);
    if (!parsed.success) return parsed.error;

    const { id } = await params;
    const where = eq(reportVersions.reportId, id);
    const opts = serviceOpts(parsed.data);

    try {
      const [rows, totalRow] = await Promise.all([
        db
          .select()
          .from(reportVersions)
          .where(where)
          .orderBy(reportVersions.version)
          .limit(opts.limit)
          .offset(opts.offset),
        db.select({ count: count() }).from(reportVersions).where(where),
      ]);
      return NextResponse.json(listEnvelope(rows, totalRow[0]?.count ?? 0, parsed.data.page, parsed.data.pageSize));
    } catch (error) {
      return internalError(error);
    }
  });
}
