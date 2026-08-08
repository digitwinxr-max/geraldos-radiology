import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { studyBookmarks } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** GET /api/bookmarks?userId= — saved studies for the radiologist workspace. */
export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId") ?? "local-user";
  try {
    const bookmarks = await db
      .select()
      .from(studyBookmarks)
      .where(eq(studyBookmarks.userId, userId))
      .orderBy(desc(studyBookmarks.createdAt));
    return NextResponse.json({ ok: true, bookmarks });
  } catch (error) {
    return NextResponse.json({ ok: false, error: "failed to load bookmarks", detail: String(error) }, { status: 500 });
  }
}

/** POST /api/bookmarks { studyId?, orthancStudyId?, label, note, userId } */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.label && !body?.studyId && !body?.orthancStudyId) {
    return NextResponse.json({ error: "a study reference or label is required" }, { status: 400 });
  }
  try {
    const [row] = await db
      .insert(studyBookmarks)
      .values({
        userId: body.userId ?? "local-user",
        studyId: body.studyId ?? null,
        orthancStudyId: body.orthancStudyId ?? null,
        label: body.label ?? "Bookmarked study",
        note: body.note ?? null,
      })
      .returning();
    await recordAudit({
      action: "bookmark.created",
      module: "imaging",
      entityType: "study_bookmark",
      entityId: row.id,
      details: { label: row.label },
    });
    return NextResponse.json({ ok: true, bookmark: row }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "failed to create bookmark", detail: String(error) }, { status: 500 });
  }
}
