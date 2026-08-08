import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** PATCH /api/notifications/[id] { read: true } — mark read. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const [row] = await db
    .update(notifications)
    .set({ read: body.read === true })
    .where(eq(notifications.id, id))
    .returning();
  if (!row) return NextResponse.json({ error: "notification not found" }, { status: 404 });
  return NextResponse.json({ ok: true, notification: row });
}

/** DELETE /api/notifications/[id] — dismiss. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row] = await db.delete(notifications).where(eq(notifications.id, id)).returning();
  if (!row) return NextResponse.json({ error: "notification not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
