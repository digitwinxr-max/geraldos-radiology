/**
 * GeraldOS Knowledge Platform — the organisational brain.
 *
 * Categories cover SOPs, radiology protocols, machine manuals, vendor guides,
 * quality procedures, accreditation standards, radiation safety, policies,
 * training material, reporting templates and preparation guides. The Knowledge
 * Agent answers exclusively from documents stored here (status = published).
 */

import { db } from "@/db";
import { knowledgeDocuments } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";

// Client-safe constants live in @/lib/knowledge-categories (no db import).
export { KNOWLEDGE_CATEGORIES, DOC_TYPES, type KnowledgeCategory } from "@/lib/knowledge-categories";

export interface KnowledgeSearchResult {
  id: string;
  title: string;
  category: string;
  docType: string;
  summary: string | null;
  content: string;
  tags: string[];
  version: string;
  author: string | null;
  status: string;
  updatedAt: Date;
}

export async function searchKnowledge(query: string, opts: { category?: string; limit?: number } = {}): Promise<KnowledgeSearchResult[]> {
  const q = query.trim();
  const limit = opts.limit ?? 20;
  let rows;
  if (!q) {
    rows = await db
      .select()
      .from(knowledgeDocuments)
      .where(opts.category ? eq(knowledgeDocuments.category, opts.category) : undefined)
      .orderBy(desc(knowledgeDocuments.updatedAt))
      .limit(limit);
    return rows as KnowledgeSearchResult[];
  }
  // Tokenized: rank documents by how many query tokens they contain (≥ 2 required).
  const tokens = q.split(/\s+/).filter((t) => t.length > 2);
  const term = (col: unknown, tok: string) => sql`(${col}::text ILIKE ${`%${tok}%`})::int`;
  const tokenMatches = tokens.length === 0
    ? sql`0`
    : tokens.map((tok) => sql`(${term(knowledgeDocuments.title, tok)} + ${term(knowledgeDocuments.summary, tok)} + ${term(knowledgeDocuments.content, tok)} + (SELECT COALESCE(MAX((t ILIKE ${`%${tok}%`})::int), 0) FROM jsonb_array_elements_text(${knowledgeDocuments.tags}) t))`).reduce((acc, c) => sql`${acc} + ${c}`);
  rows = await db
    .select()
    .from(knowledgeDocuments)
    .where(
      sql`${knowledgeDocuments.status} = 'published' AND ${tokenMatches} >= ${Math.min(2, tokens.length || 1)}`
    )
    .orderBy(desc(sql`${tokenMatches}`), desc(knowledgeDocuments.updatedAt))
    .limit(limit);
  return rows as KnowledgeSearchResult[];
}

export async function listKnowledgeByCategory(): Promise<Record<string, KnowledgeSearchResult[]>> {
  const all = (await db
    .select()
    .from(knowledgeDocuments)
    .where(eq(knowledgeDocuments.status, "published"))
    .orderBy(desc(knowledgeDocuments.updatedAt))) as KnowledgeSearchResult[];
  return all.reduce<Record<string, KnowledgeSearchResult[]>>((acc, doc) => {
    (acc[doc.category] ??= []).push(doc);
    return acc;
  }, {});
}
