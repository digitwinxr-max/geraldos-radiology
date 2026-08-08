import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { studyAnnotations } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** GET /api/annotations?studyId=&orthancStudyId= — persisted measurements & annotations. */
export async function GET(request: NextRequest) {
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
  } catch (error) {
    return NextResponse.json({ ok: false, error: "failed to load annotations", detail: String(error) }, { status: 500 });
  }
}

/** POST /api/annotations { studyId?, orthancStudyId?, seriesInstanceUid?, tool, label, data, createdBy } */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.tool || !body?.data) {
    return NextResponse.json({ error: "tool and data are required" }, { status: 400 });
  }
  try {
    const [row] = await db
      .insert(studyAnnotations)
      .values({
        studyId: body.studyId ?? null,
        orthancStudyId: body.orthancStudyId ?? null,
        seriesInstanceUid: body.seriesInstanceUid ?? null,
        tool: body.tool,
        label: body.label ?? null,
        data: body.data,
        createdBy: body.createdBy ?? "radiologist",
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
  } catch (error) {
    return NextResponse.json({ error: "failed to save annotation", detail: String(error) }, { status: 500 });
  }
}
