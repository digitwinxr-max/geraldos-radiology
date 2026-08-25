/**
 * GeraldOS Knowledge Service
 *
 * Wraps the knowledge platform (src/lib/knowledge.ts) and provides
 * document CRUD for the API layer.
 */

import { db } from "@/db";
import { knowledgeDocuments } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { searchKnowledge } from "@/lib/knowledge";
import { recordAudit } from "@/lib/audit";
import { publishEvent, EVENT_TYPES } from "@/lib/events";

export { searchKnowledge };

export async function listAllDocuments() {
  return db.select().from(knowledgeDocuments).orderBy(knowledgeDocuments.updatedAt);
}

export async function createDocument(input: typeof knowledgeDocuments.$inferInsert) {
  const [doc] = await db.insert(knowledgeDocuments).values(input).returning();

  await recordAudit({
    action: "knowledge.document_created",
    module: "knowledge",
    entityType: "knowledge_document",
    entityId: doc.id,
    details: { title: doc.title, category: doc.category },
  });
  if (doc.status === "published") {
    await publishEvent({
      type: EVENT_TYPES.KNOWLEDGE_PUBLISHED,
      aggregate: "knowledge",
      aggregateId: doc.id,
      payload: { title: doc.title },
    });
  }

  return doc;
}

export async function getDocument(id: string) {
  const [row] = await db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.id, id));
  return row ?? null;
}

export async function updateDocument(id: string, updates: Partial<typeof knowledgeDocuments.$inferInsert>) {
  const [row] = await db
    .update(knowledgeDocuments)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(knowledgeDocuments.id, id))
    .returning();
  return row ?? null;
}

export async function deleteDocument(id: string) {
  const [row] = await db.delete(knowledgeDocuments).where(eq(knowledgeDocuments.id, id)).returning();
  return row ?? null;
}
