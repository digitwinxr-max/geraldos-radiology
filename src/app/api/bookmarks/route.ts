import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { studyBookmarks } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { withAuth } from "@/lib/middleware-helpers";
import { validateBody, createBookmarkSchema } from "@/lib/validation";
import { internalError } from "@/lib/api-error";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** GET /api/bookmarks?userId= — saved studies for the radiologist workspace. */
export async function GET(request: NextRequest) {
  return withAuth(request, "imaging.read", async (user) => {
    const userId = request.nextUrl.searchParams.get("userId") ?? user.sub ?? "local-user";
    try {
      const bookmarks = await db
        .select()
        .from(studyBookmarks)
        .where(eq(studyBookmarks.userId, userId))
        .orderBy(desc(studyBookmarks.createdAt));
      return NextResponse.json({ ok: true, bookmarks });
    } catch {
      return internalError();
    }
  });
}

/** POST /api/bookmarks — bookmark a study for quick access. */
export async function POST(request: NextRequest) {
  return withAuth(request, "imaging.write", async (user) => {
    const v = await validateBody(request, createBookmarkSchema);
    if (!v.success) return v.error;

    try {
      const [row] = await db
        .insert(studyBookmarks)
        .values({
          userId: user.sub ?? "local-user",
          studyId: v.data.studyId ?? null,
          orthancStudyId: v.data.orthancStudyId ?? null,
          label: v.data.label ?? "Bookmarked study",
          note: v.data.note ?? null,
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
    } catch {
      return internalError();
    }
  });
}
