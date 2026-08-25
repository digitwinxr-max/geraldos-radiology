import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { studyAnnotations } from "@/db/schema";
import { and, eq, desc, count, type SQL } from "drizzle-orm";
import { withAuth } from "@/lib/middleware-helpers";
import { validateBody, createAnnotationSchema } from "@/lib/validation";
import { internalError } from "@/lib/api-error";
import { parseListQuery, listEnvelope, serviceOpts } from "@/lib/list-query";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** GET /api/annotations?studyId=&orthancStudyId= — persisted measurements & annotations. */
export async function GET(request: NextRequest) {
  return withAuth(request, "imaging.read", async () => {
    const parsed = parseListQuery(request);
    if (!parsed.success) return parsed.error;

    const studyId = request.nextUrl.searchParams.get("studyId") ?? undefined;
    const orthancStudyId = request.nextUrl.searchParams.get("orthancStudyId") ?? undefined;

    const conditions: SQL[] = [];
    if (studyId) conditions.push(eq(studyAnnotations.studyId, studyId));
    else if (orthancStudyId) conditions.push(eq(studyAnnotations.orthancStudyId, orthancStudyId));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const opts = serviceOpts(parsed.data);

    try {
      const [rows, totalRow] = await Promise.all([
        db
          .select()
          .from(studyAnnotations)
          .where(where)
          .orderBy(desc(studyAnnotations.createdAt))
          .limit(opts.limit)
          .offset(opts.offset),
        db.select({ count: count() }).from(studyAnnotations).where(where),
      ]);
      return NextResponse.json(listEnvelope(rows, totalRow[0]?.count ?? 0, parsed.data.page, parsed.data.pageSize));
    } catch {
      return internalError();
    }
  });
}

/** POST /api/annotations — create a new measurement / annotation. */
export async function POST(request: NextRequest) {
  return withAuth(request, "imaging.write", async () => {
    const v = await validateBody(request, createAnnotationSchema);
    if (!v.success) return v.error;

    try {
      const [row] = await db
        .insert(studyAnnotations)
        .values({
          studyId: v.data.studyId ?? null,
          orthancStudyId: v.data.orthancStudyId ?? null,
          seriesInstanceUid: v.data.seriesInstanceUid ?? null,
          tool: v.data.tool,
          label: v.data.label ?? null,
          data: v.data.data,
          createdBy: v.data.createdBy ?? "radiologist",
        })
        .returning();
      await recordAudit({
        action: "annotation.created",
        module: "imaging",
        entityType: "study_annotation",
        entityId: row.id,
        details: { tool: row.tool, label: row.label },
      });
      return NextResponse.json({ ok: true, annotation: row }, { status: 201 });
    } catch {
      return internalError();
    }
  });
}
