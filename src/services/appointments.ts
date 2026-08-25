/**
 * GeraldOS Appointment Service
 *
 * Encapsulates scheduling domain: list, create, and check-in logic.
 */

import { db } from "@/db";
import { appointments, patients, equipment, staff } from "@/db/schema";
import { eq, desc, count } from "drizzle-orm";
import { publishEvent, EVENT_TYPES } from "@/lib/events";
import { recordAudit } from "@/lib/audit";
import { orderByDir, type ServiceListOpts } from "@/lib/list-query";

/** Sort allowlist for GET /api/appointments (kept in sync with the route). */
const SORT_COLUMNS = {
  scheduledDate: appointments.scheduledDate,
  createdAt: appointments.createdAt,
} as const;

export async function listAppointments(opts: ServiceListOpts) {
  const order = opts.sort
    ? orderByDir(SORT_COLUMNS[opts.sort as keyof typeof SORT_COLUMNS], opts.dir)
    : desc(appointments.scheduledDate);

  const base = db
    .select({
      id: appointments.id,
      scheduledDate: appointments.scheduledDate,
      scheduledTime: appointments.scheduledTime,
      duration: appointments.duration,
      modality: appointments.modality,
      procedure: appointments.procedure,
      priority: appointments.priority,
      status: appointments.status,
      checkedIn: appointments.checkedIn,
      checkedInAt: appointments.checkedInAt,
      notes: appointments.notes,
      patientFirstName: patients.firstName,
      patientLastName: patients.lastName,
      patientMrn: patients.mrn,
      equipmentName: equipment.name,
      radiographerFirstName: staff.firstName,
      radiographerLastName: staff.lastName,
    })
    .from(appointments)
    .leftJoin(patients, eq(appointments.patientId, patients.id))
    .leftJoin(equipment, eq(appointments.equipmentId, equipment.id))
    .leftJoin(staff, eq(appointments.radiographerId, staff.id));

  const [rows, totalRow] = await Promise.all([
    opts.sort
      ? base.orderBy(order).limit(opts.limit).offset(opts.offset)
      : base
          .orderBy(desc(appointments.scheduledDate), appointments.scheduledTime)
          .limit(opts.limit)
          .offset(opts.offset),
    db.select({ count: count() }).from(appointments),
  ]);

  return { rows, total: totalRow[0]?.count ?? 0 };
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
