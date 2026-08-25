/**
 * GeraldOS Reports Service
 *
 * Encapsulates report CRUD and lifecycle (draft → sign → release).
 * Delegates template/quality logic to src/lib/reporting.ts.
 */

import { db } from "@/db";
import { reports, patients, staff, reportVersions } from "@/db/schema";
import { eq, desc, count } from "drizzle-orm";
import { publishEvent, EVENT_TYPES } from "@/lib/events";
import { recordAudit } from "@/lib/audit";
import { orderByDir, type ServiceListOpts } from "@/lib/list-query";

/** Sort allowlist for GET /api/reports (kept in sync with the route). */
const SORT_COLUMNS = {
  createdAt: reports.createdAt,
} as const;

export interface ListReportsOpts extends ServiceListOpts {
  patientId?: string;
}

export async function listReports(opts: ListReportsOpts) {
  const order = opts.sort
    ? orderByDir(SORT_COLUMNS[opts.sort as keyof typeof SORT_COLUMNS], opts.dir)
    : desc(reports.createdAt);
  const where = opts.patientId ? eq(reports.patientId, opts.patientId) : undefined;

  const base = db
    .select({
      id: reports.id,
      studyId: reports.studyId,
      patientId: reports.patientId,
      templateName: reports.templateName,
      findings: reports.findings,
      impression: reports.impression,
      recommendation: reports.recommendation,
      status: reports.status,
      signedAt: reports.signedAt,
      createdAt: reports.createdAt,
      patientFirstName: patients.firstName,
      patientLastName: patients.lastName,
      patientMrn: patients.mrn,
      radiologistFirstName: staff.firstName,
      radiologistLastName: staff.lastName,
    })
    .from(reports)
    .leftJoin(patients, eq(reports.patientId, patients.id))
    .leftJoin(staff, eq(reports.radiologistId, staff.id))
    .where(where);

  const [rows, totalRow] = await Promise.all([
    base.orderBy(order).limit(opts.limit).offset(opts.offset),
    db.select({ count: count() }).from(reports).where(where),
  ]);

  return { rows, total: totalRow[0]?.count ?? 0 };
}

export async function createReport(input: typeof reports.$inferInsert) {
  const [row] = await db.insert(reports).values(input).returning();

  await recordAudit({
    action: "report.created",
    module: "reporting",
    entityType: "report",
    entityId: row.id,
  });
  await publishEvent({
    type: EVENT_TYPES.REPORT_STARTED,
    aggregate: "report",
    aggregateId: row.id,
  });

  return row;
}

export async function getReport(id: string) {
  const [row] = await db.select().from(reports).where(eq(reports.id, id));
  return row ?? null;
}

export async function signReport(id: string, signedBy: string) {
  const [row] = await db
    .update(reports)
    .set({ status: "signed", signedAt: new Date(), updatedAt: new Date() })
    .where(eq(reports.id, id))
    .returning();

  if (!row) return null;

  await recordAudit({
    userId: signedBy,
    action: "report.signed",
    module: "reporting",
    entityType: "report",
    entityId: id,
  });
  await publishEvent({
    type: EVENT_TYPES.REPORT_SIGNED,
    aggregate: "report",
    aggregateId: id,
    payload: { signedBy },
  });

  return row;
}

export async function saveReportVersion(reportId: string, changedBy: string) {
  const [report] = await db.select().from(reports).where(eq(reports.id, reportId));
  if (!report) return null;

  const [latest] = await db
    .select({ version: reportVersions.version })
    .from(reportVersions)
    .where(eq(reportVersions.reportId, reportId))
    .orderBy(desc(reportVersions.version))
    .limit(1);

  const nextVersion = (latest?.version ?? 0) + 1;

  const [version] = await db
    .insert(reportVersions)
    .values({
      reportId,
      version: nextVersion,
      findings: report.findings,
      impression: report.impression,
      recommendation: report.recommendation,
      status: report.status,
      changedBy,
    })
    .returning();

  await publishEvent({
    type: EVENT_TYPES.REPORT_VERSIONED,
    aggregate: "report",
    aggregateId: reportId,
    payload: { version: nextVersion },
  });

  return version;
}

export async function listReportVersions(reportId: string) {
  return db
    .select()
    .from(reportVersions)
    .where(eq(reportVersions.reportId, reportId))
    .orderBy(desc(reportVersions.version));
}
