/**
 * GeraldOS Equipment Service
 *
 * Encapsulates equipment asset management and maintenance tracking.
 */

import { db } from "@/db";
import { equipment, maintenanceRecords } from "@/db/schema";
import { eq, desc, count } from "drizzle-orm";
import type { ServiceListOpts } from "@/lib/list-query";

export async function listEquipment(opts: ServiceListOpts) {
  const [rows, totalRow] = await Promise.all([
    db.select().from(equipment).orderBy(equipment.name).limit(opts.limit).offset(opts.offset),
    db.select({ count: count() }).from(equipment),
  ]);
  return { rows, total: totalRow[0]?.count ?? 0 };
}

export async function createEquipment(input: typeof equipment.$inferInsert) {
  const [row] = await db.insert(equipment).values(input).returning();
  return row;
}

export async function getEquipment(id: string) {
  const [row] = await db.select().from(equipment).where(eq(equipment.id, id));
  return row ?? null;
}

export async function listMaintenanceRecords(equipmentId?: string) {
  if (equipmentId) {
    return db
      .select()
      .from(maintenanceRecords)
      .where(eq(maintenanceRecords.equipmentId, equipmentId))
      .orderBy(desc(maintenanceRecords.createdAt));
  }
  return db.select().from(maintenanceRecords).orderBy(desc(maintenanceRecords.createdAt));
}

export async function createMaintenanceRecord(input: typeof maintenanceRecords.$inferInsert) {
  const [row] = await db.insert(maintenanceRecords).values(input).returning();
  return row;
}
