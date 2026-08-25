import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { studyAnnotations } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { withAuth } from "@/lib/middleware-helpers";
import { validateBody, createAnnotationSchema } from "@/lib/validation";
import { internalError } from "@/lib/api-error";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** GET /api/annotations?studyId=&orthancStudyId= — persisted measurements & annotations. */
export async function GET(request: NextRequest) {
  return withAuth(request, "imaging.read", async () => {
    const studyId = request.nextUrl.searchParams.get("studyId") ?? undefined;
    const orthancStudyId = request.nextUrl.searchParams.get("orthancStudyId") ?? undefined;
    try {
      let rows;
      if (studyId) {
        rows = await db.select().from(studyAnnotations).where(eq(studyAnnotations.studyId, studyId)).orderBy(desc(studyAnnotations.createdAt));
      } else if (orthancStudyId) {
        rows = await db.select().from(studyAnnotations).where(eq(studyAnnotations.orthancStudyId, orthancStudyId)).orderBy(desc(studyAnnotations.createdAt));
      } else {
        rows = await db.select().from(studyAnnotations).orderBy(desc(studyAnnotations.createdAt)).limit(100);
      }
      return NextResponse.json({ ok: true, annotations: rows });
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
