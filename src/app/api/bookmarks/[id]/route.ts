import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { studyBookmarks } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row] = await db.delete(studyBookmarks).where(eq(studyBookmarks.id, id)).returning();
  if (!row) return NextResponse.json({ error: "bookmark not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
