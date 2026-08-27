import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { logger, serializeError } from "@/lib/logger";

export interface AuditEntry {
  userId?: string;
  action: string;
  module: string;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbClient = typeof db | Tx;

function buildAuditValues(entry: AuditEntry) {
  return {
    userId: entry.userId ?? "system",
    action: entry.action,
    module: entry.module,
    entityType: entry.entityType ?? null,
    entityId: entry.entityId ?? null,
    details: entry.details ?? null,
  };
}

/**
 * Best-effort audit write on the root connection. Failures are logged, never
 * thrown — auditing must not break the user-facing operation.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLog).values(buildAuditValues(entry));
  } catch (error) {
    logger.error("audit write failed", { err: serializeError(error), action: entry.action, module: entry.module });
  }
}

/**
 * Audit write INSIDE a transaction (atomic with the domain mutation). Unlike
 * {@link recordAudit} this can throw — a rolled-back mutation must not leave a
 * dangling audit row claiming an action that never committed.
 */
export async function recordAuditInTransaction(tx: DbClient, entry: AuditEntry): Promise<void> {
  await tx.insert(auditLog).values(buildAuditValues(entry));
}
