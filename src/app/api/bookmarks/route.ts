import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { studyBookmarks } from "@/db/schema";
import { desc, eq, count } from "drizzle-orm";
import { withAuth } from "@/lib/middleware-helpers";
import { validateBody, createBookmarkSchema } from "@/lib/validation";
import { internalError } from "@/lib/api-error";
import { parseListQuery, listEnvelope, serviceOpts } from "@/lib/list-query";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** GET /api/bookmarks?userId= — saved studies for the radiologist workspace. */
export async function GET(request: NextRequest) {
  return withAuth(request, "imaging.read", async (user) => {
    const parsed = parseListQuery(request);
    if (!parsed.success) return parsed.error;

    const userId = request.nextUrl.searchParams.get("userId") ?? user.sub ?? "local-user";
    const where = eq(studyBookmarks.userId, userId);
    const opts = serviceOpts(parsed.data);

    try {
      const [rows, totalRow] = await Promise.all([
        db
          .select()
          .from(studyBookmarks)
          .where(where)
          .orderBy(desc(studyBookmarks.createdAt))
          .limit(opts.limit)
          .offset(opts.offset),
        db.select({ count: count() }).from(studyBookmarks).where(where),
      ]);
      return NextResponse.json(listEnvelope(rows, totalRow[0]?.count ?? 0, parsed.data.page, parsed.data.pageSize));
    } catch (error) {
      return internalError(error);
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
    } catch (error) {
      return internalError(error);
    }
  });
}
