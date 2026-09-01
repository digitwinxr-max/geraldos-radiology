/**
 * GeraldOS Referrals Service
 *
 * Encapsulates the referral intake domain: list and register referring-physician
 * referrals against patients. A referral is the clinical entry point — the
 * workflow study is born at stage `referral` (see createWorkflowStudy).
 */

import { db } from "@/db";
import { referrals, patients } from "@/db/schema";
import { count, desc, eq } from "drizzle-orm";
import { publishEvent, EVENT_TYPES } from "@/lib/events";
import { recordAudit } from "@/lib/audit";
import { orderByDir, type ServiceListOpts } from "@/lib/list-query";

const SORT_COLUMNS = {
  createdAt: referrals.createdAt,
} as const;

export async function listReferrals(opts: ServiceListOpts, patientId?: string) {
  const order = opts.sort
    ? orderByDir(SORT_COLUMNS[opts.sort as keyof typeof SORT_COLUMNS], opts.dir)
    : desc(referrals.createdAt);

  const base = db
    .select({
      id: referrals.id,
      patientId: referrals.patientId,
      referringPhysician: referrals.referringPhysician,
      referringFacility: referrals.referringFacility,
      clinicalIndication: referrals.clinicalIndication,
      requestedProcedure: referrals.requestedProcedure,
      priority: referrals.priority,
      status: referrals.status,
      notes: referrals.notes,
      createdAt: referrals.createdAt,
      patientFirstName: patients.firstName,
      patientLastName: patients.lastName,
      patientMrn: patients.mrn,
    })
    .from(referrals)
    .leftJoin(patients, eq(referrals.patientId, patients.id));

  const scoped = patientId ? base.where(eq(referrals.patientId, patientId)) : base;

  const [rows, totalRow] = await Promise.all([
    scoped.orderBy(order).limit(opts.limit).offset(opts.offset),
    db.select({ count: count() }).from(referrals),
  ]);

  return { rows, total: totalRow[0]?.count ?? 0 };
}

export async function createReferral(input: typeof referrals.$inferInsert) {
  const [row] = await db.insert(referrals).values(input).returning();

  await recordAudit({
    action: "referral.received",
    module: "reception",
    entityType: "referral",
    entityId: row.id,
    details: {
      patientId: row.patientId,
      referringPhysician: row.referringPhysician,
      requestedProcedure: row.requestedProcedure,
      priority: row.priority,
    },
  });
  await publishEvent({
    type: EVENT_TYPES.REFERRAL_RECEIVED,
    aggregate: "referral",
    aggregateId: row.id,
    payload: {
      patientId: row.patientId,
      referringPhysician: row.referringPhysician,
      requestedProcedure: row.requestedProcedure,
      priority: row.priority,
    },
  });

  return row;
}
