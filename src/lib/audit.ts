import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { logger, serializeError } from "@/lib/logger";

export async function recordAudit(entry: {
  userId?: string;
  action: string;
  module: string;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(auditLog).values({
      userId: entry.userId ?? "system",
      action: entry.action,
      module: entry.module,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      details: entry.details ?? null,
    });
  } catch (error) {
    logger.error("audit write failed", { err: serializeError(error), action: entry.action, module: entry.module });
  }
}
