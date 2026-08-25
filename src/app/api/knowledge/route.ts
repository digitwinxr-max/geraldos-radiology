import { NextRequest, NextResponse } from "next/server";
import { searchKnowledge } from "@/lib/knowledge";
import { db } from "@/db";
import { knowledgeDocuments } from "@/db/schema";
import { count } from "drizzle-orm";
import { recordAudit } from "@/lib/audit";
import { publishEvent } from "@/lib/events";
import { internalError, validationFailed } from "@/lib/api-error";
import { parseListQuery, listEnvelope, serviceOpts } from "@/lib/list-query";

export const dynamic = "force-dynamic";

/** GET /api/knowledge?q=ct+protocol&category=protocol&includeAll=1 */
export async function GET(request: NextRequest) {
  // Knowledge lists are small; keep the historical default of 20 rows.
  const parsed = parseListQuery(request, { defaultPageSize: 20 });
  if (!parsed.success) return parsed.error;

  const q = request.nextUrl.searchParams.get("q") ?? "";
  const category = request.nextUrl.searchParams.get("category") ?? undefined;
  const includeAll = request.nextUrl.searchParams.get("includeAll") === "1";
  const opts = serviceOpts(parsed.data);

  try {
    if (includeAll && !q) {
      // Include drafts/archived for the editor view.
      const [rows, totalRow] = await Promise.all([
        db
          .select()
          .from(knowledgeDocuments)
          .orderBy(knowledgeDocuments.updatedAt)
          .limit(opts.limit)
          .offset(opts.offset),
        db.select({ count: count() }).from(knowledgeDocuments),
      ]);
      return NextResponse.json(listEnvelope(rows, totalRow[0]?.count ?? 0, parsed.data.page, parsed.data.pageSize));
    }
    // Ranked token search: rank the full set, then page in memory.
    const ranked = await searchKnowledge(q, { category, limit: 200 });
    const pageRows = ranked.slice(opts.offset, opts.offset + opts.limit);
    return NextResponse.json(listEnvelope(pageRows, ranked.length, parsed.data.page, parsed.data.pageSize));
  } catch (error) {
    return internalError(error);
  }
}

/** POST /api/knowledge { title, category, docType, content, summary, tags, version, author } */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.title || !body?.category || !body?.content) {
    return validationFailed([{ message: "title, category and content are required" }]);
  }
  try {
    const [doc] = await db
      .insert(knowledgeDocuments)
      .values({
        title: body.title,
        category: body.category,
        docType: body.docType ?? "guide",
        summary: body.summary ?? null,
        content: body.content,
        tags: Array.isArray(body.tags) ? body.tags : [],
        version: body.version ?? "1.0",
        author: body.author ?? null,
        status: body.status ?? "published",
        approvedBy: body.approvedBy ?? null,
      })
      .returning();

    await recordAudit({
      action: "knowledge.document_created",
      module: "knowledge",
      entityType: "knowledge_document",
      entityId: doc.id,
      details: { title: doc.title, category: doc.category },
    });
    if (doc.status === "published") {
      await publishEvent({ type: "knowledge.published", aggregate: "knowledge", aggregateId: doc.id, payload: { title: doc.title } });
    }
    return NextResponse.json({ ok: true, document: doc }, { status: 201 });
  } catch (error) {
    return internalError(error);
  }
}
