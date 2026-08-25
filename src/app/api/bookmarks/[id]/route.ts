import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { studyBookmarks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { withAuth } from "@/lib/middleware-helpers";
import { notFound, internalError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(request, "imaging.write", async () => {
    const { id } = await params;
    try {
      const [row] = await db.delete(studyBookmarks).where(eq(studyBookmarks.id, id)).returning();
      if (!row) return notFound("bookmark");
      return NextResponse.json({ ok: true });
    } catch {
      return internalError();
    }
  });
}
