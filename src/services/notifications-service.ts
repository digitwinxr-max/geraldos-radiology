/**
 * GeraldOS Notification Service
 *
 * Encapsulates notification creation, listing, and read-state management.
 */

import { db } from "@/db";
import { notifications } from "@/db/schema";
import { eq, desc, sql, count } from "drizzle-orm";
import { publishEvent } from "@/lib/events";
import type { ServiceListOpts } from "@/lib/list-query";

export async function listNotifications(opts: ServiceListOpts) {
  // Fetch enough recent rows to page the unread-first ordering in memory.
  const window = opts.offset + opts.limit;
  const [recent, unreadRows, unreadCountRow, totalRow] = await Promise.all([
    db
      .select()
      .from(notifications)
      .orderBy(desc(notifications.createdAt))
      .limit(Math.min(200, Math.max(window, opts.limit))),
    db
      .select()
      .from(notifications)
      .where(eq(notifications.read, false))
      .orderBy(desc(notifications.createdAt))
      .limit(Math.min(200, Math.max(window, opts.limit))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(eq(notifications.read, false)),
    db.select({ count: count() }).from(notifications),
  ]);

  // Unread notifications surface first, then the rest in recency order.
  const all = [...unreadRows, ...recent.filter((r) => !unreadRows.some((x) => x.id === r.id))];
  return {
    notifications: all.slice(opts.offset, opts.offset + opts.limit),
    unread: Number(unreadCountRow[0]?.count ?? 0),
    total: totalRow[0]?.count ?? 0,
  };
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
