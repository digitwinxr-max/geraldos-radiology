import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { desc, eq, or, sql } from "drizzle-orm";
import { publishEvent } from "@/lib/events";

export const dynamic = "force-dynamic";

/** GET /api/notifications?limit=30 — unread-first notification feed. */
export async function GET(request: NextRequest) {
  const limit = Math.min(100, Number(request.nextUrl.searchParams.get("limit") ?? 30));
  try {
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.read, false))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
    const recent = await db
      .select()
      .from(notifications)
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
    const all = [...rows, ...recent.filter((r) => !rows.some((x) => x.id === r.id))];
    const [unread] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(eq(notifications.read, false));
    return NextResponse.json({ ok: true, notifications: all, unread: Number(unread.count) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: "failed to load notifications", detail: String(error) }, { status: 500 });
  }
}

/** POST /api/notifications { title, body, type, severity, link, userId } */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.title) return NextResponse.json({ error: "title is required" }, { status: 400 });
  try {
    const [row] = await db
      .insert(notifications)
      .values({
        title: body.title,
        body: body.body ?? null,
        type: body.type ?? "info",
        severity: body.severity ?? "normal",
        link: body.link ?? null,
        userId: body.userId ?? "all",
      })
      .returning();
    await publishEvent({ type: "notification.sent", aggregate: "notification", aggregateId: row.id, payload: { title: row.title } });
    return NextResponse.json({ ok: true, notification: row }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "failed to create notification", detail: String(error) }, { status: 500 });
  }
}
