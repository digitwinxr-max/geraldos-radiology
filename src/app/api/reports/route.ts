import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { reports, patients, staff } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { withAuth } from "@/lib/middleware-helpers";
import { validateBody, createReportSchema } from "@/lib/validation";
import { internalError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withAuth(request, "reports.read", async () => {
    try {
      const result = await db
        .select({
          id: reports.id,
          studyId: reports.studyId,
          patientId: reports.patientId,
          templateName: reports.templateName,
          findings: reports.findings,
          impression: reports.impression,
          recommendation: reports.recommendation,
          status: reports.status,
          signedAt: reports.signedAt,
          createdAt: reports.createdAt,
          patientFirstName: patients.firstName,
          patientLastName: patients.lastName,
          patientMrn: patients.mrn,
          radiologistFirstName: staff.firstName,
          radiologistLastName: staff.lastName,
        })
        .from(reports)
        .leftJoin(patients, eq(reports.patientId, patients.id))
        .leftJoin(staff, eq(reports.radiologistId, staff.id))
        .orderBy(desc(reports.createdAt));

      return NextResponse.json(result);
    } catch (error) {
      console.error("reports GET failed", error);
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
    } catch (error) {
      console.error("reports POST failed", error);
      return internalError();
    }
  });
}
