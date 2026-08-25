/**
 * GeraldOS Patient Service
 *
 * Encapsulates patient domain logic: search, CRUD and event publishing.
 * Routes call into this service after Zod validation and RBAC checks.
 */

import { db } from "@/db";
import { patients } from "@/db/schema";
import { and, ilike, or, count, sql, type SQL } from "drizzle-orm";
import { publishEvent, EVENT_TYPES } from "@/lib/events";
import { recordAudit } from "@/lib/audit";

export interface ListPatientsOpts {
  search?: string;
  limit: number;
  offset: number;
}

export async function listPatients(opts: ListPatientsOpts) {
  const conditions: SQL[] = [];
  if (opts.search) {
    const q = `%${opts.search}%`;
    conditions.push(
      or(
        ilike(patients.firstName, q),
        ilike(patients.lastName, q),
        ilike(patients.mrn, q),
      )!,
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, totalRow] = await Promise.all([
    db
      .select()
      .from(patients)
      .where(where)
      .orderBy(patients.lastName, patients.firstName)
      .limit(opts.limit)
      .offset(opts.offset),
    db.select({ count: count() }).from(patients).where(where),
  ]);

  return { data: rows, total: totalRow[0]?.count ?? 0 };
}

export async function createPatient(input: typeof patients.$inferInsert) {
  const [row] = await db.insert(patients).values(input).returning();

  await recordAudit({
    action: "patient.created",
    module: "patients",
    entityType: "patient",
    entityId: row.id,
    details: { mrn: row.mrn },
  });
  await publishEvent({
    type: EVENT_TYPES.PATIENT_REGISTERED,
    aggregate: "patient",
    aggregateId: row.id,
    payload: { mrn: row.mrn, firstName: row.firstName, lastName: row.lastName },
  });

  return row;
}

export async function getPatient(id: string) {
  const [row] = await db.select().from(patients).where(sql`${patients.id} = ${id}`);
  return row ?? null;
}
