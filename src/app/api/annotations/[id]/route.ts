import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { studyAnnotations } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row] = await db.delete(studyAnnotations).where(eq(studyAnnotations.id, id)).returning();
  if (!row) return NextResponse.json({ error: "annotation not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
