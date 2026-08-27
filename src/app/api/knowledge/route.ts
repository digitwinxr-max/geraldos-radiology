import { NextRequest, NextResponse } from "next/server";
import { searchKnowledge, createDocument, listAllDocuments } from "@/services/knowledge-service";
import { internalError, validationFailed } from "@/lib/api-error";
import { withAuth } from "@/lib/middleware-helpers";
import { parseListQuery, listEnvelope, serviceOpts } from "@/lib/list-query";

export const dynamic = "force-dynamic";

/** GET /api/knowledge?q=ct+protocol&category=protocol&includeAll=1 */
export async function GET(request: NextRequest) {
  return withAuth(request, "knowledge.read", async () => {
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
        const { rows, total } = await listAllForEditor(opts.limit, opts.offset);
        return NextResponse.json(listEnvelope(rows, total, parsed.data.page, parsed.data.pageSize));
      }
      // Ranked token search: rank the full set, then page in memory.
      const ranked = await searchKnowledge(q, { category, limit: 200 });
      const pageRows = ranked.slice(opts.offset, opts.offset + opts.limit);
      return NextResponse.json(listEnvelope(pageRows, ranked.length, parsed.data.page, parsed.data.pageSize));
    } catch (error) {
      return internalError(error);
    }
  });
}

/** POST /api/knowledge { title, category, docType, content, summary, tags, version, author } */
export async function POST(request: NextRequest) {
  return withAuth(request, "knowledge.write", async () => {
    const body = await request.json().catch(() => null);
    if (!body?.title || !body?.category || !body?.content) {
      return validationFailed([{ message: "title, category and content are required" }]);
    }
    try {
      const doc = await createDocument({
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
      });
      return NextResponse.json({ ok: true, document: doc }, { status: 201 });
    } catch (error) {
      return internalError(error);
    }
  });
}

/** Paged editor listing over the service-layer document set. */
async function listAllForEditor(limit: number, offset: number) {
  const rows = await listAllDocuments();
  return { rows: rows.slice(offset, offset + limit), total: rows.length };
}
