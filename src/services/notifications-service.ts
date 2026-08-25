/**
 * GeraldOS Notification Service
 *
 * Encapsulates notification creation, listing, and read-state management.
 */

import { db } from "@/db";
import { notifications } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { publishEvent } from "@/lib/events";

export async function listNotifications(limit = 30) {
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

  return { notifications: all, unread: Number(unread.count) };
}

export async function createNotification(input: typeof notifications.$inferInsert) {
  const [row] = await db.insert(notifications).values(input).returning();

  await publishEvent({
    type: "notification.sent",
    aggregate: "notification",
    aggregateId: row.id,
    payload: { title: row.title },
  });

  return row;
}

export async function markNotificationRead(id: string) {
  const [row] = await db
    .update(notifications)
    .set({ read: true })
    .where(eq(notifications.id, id))
    .returning();
  return row ?? null;
}

export async function getNotification(id: string) {
  const [row] = await db.select().from(notifications).where(eq(notifications.id, id));
  return row ?? null;
}
