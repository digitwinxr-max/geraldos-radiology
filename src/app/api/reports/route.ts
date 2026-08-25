import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { reports } from "@/db/schema";
import { withAuth } from "@/lib/middleware-helpers";
import { validateBody, createReportSchema } from "@/lib/validation";
import { internalError } from "@/lib/api-error";
import { parseListQuery, listEnvelope, serviceOpts } from "@/lib/list-query";
import { listReports } from "@/services/reports-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withAuth(request, "reports.read", async () => {
    const parsed = parseListQuery(request, { sorts: ["createdAt"] });
    if (!parsed.success) return parsed.error;

    // report-editor passes ?patientId= to scope the list to one patient.
    const patientId = request.nextUrl.searchParams.get("patientId") ?? undefined;

    try {
      const { rows, total } = await listReports({ ...serviceOpts(parsed.data), patientId });
      return NextResponse.json(listEnvelope(rows, total, parsed.data.page, parsed.data.pageSize));
    } catch {
      return internalError();
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, "reports.write", async () => {
    const parsed = await validateBody(request, createReportSchema);
    if (!parsed.success) return parsed.error;

    try {
      const result = await db.insert(reports).values(parsed.data).returning();
      return NextResponse.json(result[0], { status: 201 });
    } catch {
      return internalError();
    }
  });
}
