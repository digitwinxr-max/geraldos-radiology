/**
 * GeraldOS Appointment Service
 *
 * Encapsulates scheduling domain: list, create, and check-in logic.
 */

import { db } from "@/db";
import { appointments, patients, equipment, staff } from "@/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { publishEvent, EVENT_TYPES } from "@/lib/events";
import { recordAudit } from "@/lib/audit";

export async function listAppointments(opts: { limit?: number } = {}) {
  const limit = opts.limit ?? 100;
  const rows = await db
    .select({
      id: appointments.id,
      patientId: appointments.patientId,
      patientName: sql<string>`concat(${patients.firstName}, ' ', ${patients.lastName})`,
      modality: appointments.modality,
      procedure: appointments.procedure,
      scheduledDate: appointments.scheduledDate,
      scheduledTime: appointments.scheduledTime,
      duration: appointments.duration,
      priority: appointments.priority,
      status: appointments.status,
      radiographerId: appointments.radiographerId,
      equipmentId: appointments.equipmentId,
      checkedIn: appointments.checkedIn,
    })
    .from(appointments)
    .leftJoin(patients, eq(appointments.patientId, patients.id))
    .orderBy(desc(appointments.scheduledDate), desc(appointments.scheduledTime))
    .limit(limit);

  return rows;
}

export async function createAppointment(input: typeof appointments.$inferInsert) {
  const [row] = await db.insert(appointments).values(input).returning();

  await recordAudit({
    action: "appointment.created",
    module: "scheduling",
    entityType: "appointment",
    entityId: row.id,
  });
  await publishEvent({
    type: EVENT_TYPES.APPOINTMENT_CREATED,
    aggregate: "appointment",
    aggregateId: row.id,
    payload: { patientId: row.patientId, modality: row.modality },
  });

  return row;
}

export async function checkInAppointment(id: string) {
  const [row] = await db
    .update(appointments)
    .set({ checkedIn: true, checkedInAt: new Date(), status: "checked_in", updatedAt: new Date() })
    .where(eq(appointments.id, id))
    .returning();

  if (!row) return null;

  await recordAudit({
    action: "appointment.checked_in",
    module: "scheduling",
    entityType: "appointment",
    entityId: id,
  });
  await publishEvent({
    type: EVENT_TYPES.APPOINTMENT_CHECKED_IN,
    aggregate: "appointment",
    aggregateId: id,
  });

  return row;
}
