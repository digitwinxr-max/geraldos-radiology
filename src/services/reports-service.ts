/**
 * GeraldOS Reports Service
 *
 * Encapsulates report CRUD and lifecycle (draft → sign → release).
 * Delegates template/quality logic to src/lib/reporting.ts.
 */

import { db } from "@/db";
import { reports, patients, workflowStudies, reportVersions } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { publishEvent, EVENT_TYPES } from "@/lib/events";
import { recordAudit } from "@/lib/audit";

export async function listReports(opts: { limit?: number } = {}) {
  const limit = opts.limit ?? 100;
  const rows = await db
    .select({
      id: reports.id,
      studyId: reports.studyId,
      patientId: reports.patientId,
      patientName: sql<string>`concat(${patients.firstName}, ' ', ${patients.lastName})`,
      radiologistId: reports.radiologistId,
      templateName: reports.templateName,
      findings: reports.findings,
      impression: reports.impression,
      recommendation: reports.recommendation,
      status: reports.status,
      signedAt: reports.signedAt,
      createdAt: reports.createdAt,
      updatedAt: reports.updatedAt,
    })
    .from(reports)
    .leftJoin(patients, eq(reports.patientId, patients.id))
    .orderBy(desc(reports.createdAt))
    .limit(limit);

  return rows;
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
