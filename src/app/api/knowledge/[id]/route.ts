import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { knowledgeDocuments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { recordAudit } from "@/lib/audit";
import { publishEvent } from "@/lib/events";
import { withAuth } from "@/lib/middleware-helpers";
import { validateBody, updateKnowledgeDocSchema } from "@/lib/validation";
import { notFound, apiError, internalError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(request, "knowledge.read", async () => {
    const { id } = await params;
    try {
      const [doc] = await db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.id, id));
      if (!doc) return notFound("document");
      return NextResponse.json({ ok: true, document: doc });
    } catch (error) {
      return internalError(error);
    }
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(request, "knowledge.write", async () => {
    const { id } = await params;
    const v = await validateBody(request, updateKnowledgeDocSchema);
    if (!v.success) return v.error;

    try {
      const [doc] = await db
        .update(knowledgeDocuments)
        .set({ ...v.data, updatedAt: new Date() })
        .where(eq(knowledgeDocuments.id, id))
        .returning();
      if (!doc) return notFound("document");

      await recordAudit({
        action: "knowledge.document_updated",
        module: "knowledge",
        entityType: "knowledge_document",
        entityId: doc.id,
        details: { title: doc.title, status: doc.status },
      });
      if (v.data.status === "published") {
        await publishEvent({ type: "knowledge.published", aggregate: "knowledge", aggregateId: doc.id, payload: { title: doc.title } });
      }
      return NextResponse.json({ ok: true, document: doc });
    } catch (error) {
      return internalError(error);
    }
  });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(request, "knowledge.write", async () => {
    const { id } = await params;
    try {
      const [doc] = await db.delete(knowledgeDocuments).where(eq(knowledgeDocuments.id, id)).returning();
      if (!doc) return notFound("document");
      await recordAudit({
        action: "knowledge.document_deleted",
        module: "knowledge",
        entityType: "knowledge_document",
        entityId: id,
        details: { title: doc.title },
      });
      return NextResponse.json({ ok: true });
    } catch (error) {
      return internalError(error);
    }
  });
}
