/**
 * GeraldOS Inventory Service
 *
 * Encapsulates inventory item management and stock adjustments.
 */

import { db } from "@/db";
import { inventoryItems, inventoryTransactions } from "@/db/schema";
import { eq, sql, desc, count } from "drizzle-orm";
import { publishEvent, EVENT_TYPES } from "@/lib/events";
import type { ServiceListOpts } from "@/lib/list-query";

export async function listInventory(opts: ServiceListOpts) {
  const [rows, totalRow] = await Promise.all([
    db.select().from(inventoryItems).orderBy(inventoryItems.category, inventoryItems.name).limit(opts.limit).offset(opts.offset),
    db.select({ count: count() }).from(inventoryItems),
  ]);
  return { rows, total: totalRow[0]?.count ?? 0 };
}

export async function createInventoryItem(input: typeof inventoryItems.$inferInsert) {
  const [row] = await db.insert(inventoryItems).values(input).returning();
  return row;
}

export async function getInventoryItem(id: string) {
  const [row] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id));
  return row ?? null;
}

export async function adjustStock(
  itemId: string,
  quantity: number,
  type: string,
  performedBy: string,
) {
  const [updated] = await db
    .update(inventoryItems)
    .set({
      currentStock: sql`${inventoryItems.currentStock} + ${quantity}`,
      updatedAt: new Date(),
    })
    .where(eq(inventoryItems.id, itemId))
    .returning();

  if (!updated) return null;

  await db.insert(inventoryTransactions).values({
    itemId,
    type,
    quantity,
    performedBy,
  });

  // Emit low-stock event if below minimum
  if (updated.currentStock <= updated.minimumStock) {
    await publishEvent({
      type: EVENT_TYPES.INVENTORY_LOW_STOCK,
      aggregate: "inventory",
      aggregateId: itemId,
      payload: { name: updated.name, currentStock: updated.currentStock, minimumStock: updated.minimumStock },
    });
  }

  await publishEvent({
    type: EVENT_TYPES.INVENTORY_UPDATED,
    aggregate: "inventory",
    aggregateId: itemId,
    payload: { type, quantity, currentStock: updated.currentStock },
  });

  return updated;
}

export async function listTransactions(itemId?: string) {
  if (itemId) {
    return db
      .select()
      .from(inventoryTransactions)
      .where(eq(inventoryTransactions.itemId, itemId))
      .orderBy(desc(inventoryTransactions.createdAt));
  }
  return db.select().from(inventoryTransactions).orderBy(desc(inventoryTransactions.createdAt));
}
