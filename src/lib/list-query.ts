/**
 * GeraldOS — List Query Contract
 *
 * Every list endpoint follows one contract:
 *   GET …?page=1&pageSize=50[&sort=<allowlisted>&dir=asc|desc][&<domain filters>]
 *   → { data: T[], meta: { page, pageSize, total, totalPages } }
 *
 * This module owns query parsing/validation and the response envelope.
 * Sort column mapping lives in the services (they own the SQL); routes pass
 * the allowlisted sort name through.
 */

import { z } from "zod";
import { asc, desc } from "drizzle-orm";
import type { NextRequest, NextResponse } from "next/server";
import { validationFailed } from "@/lib/api-error";

// ─── Query schema ───

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.string().min(1).max(50).optional(),
  dir: z.enum(["asc", "desc"]).optional(),
});

// ─── Result types ───

export interface ListQuery {
  page: number;
  pageSize: number;
  offset: number;
  sort?: string;
  dir: "asc" | "desc";
}

/** Options handed to service list functions. */
export interface ServiceListOpts {
  limit: number;
  offset: number;
  sort?: string;
  dir: "asc" | "desc";
}

type ParseSuccess = { success: true; data: ListQuery };
type ParseFailure = { success: false; error: NextResponse };
type ParseResult = ParseSuccess | ParseFailure;

// ─── Parser ───

/**
 * Parse and validate list query params. `sorts` is the allowlist of sortable
 * field names for the endpoint; when omitted, any `sort` param is rejected.
 * Returns a structured 400 on invalid input (same Result pattern as validateBody).
 */
export function parseListQuery(
  request: NextRequest,
  opts: { sorts?: readonly string[]; defaultPageSize?: number } = {},
): ParseResult {
  const sp = request.nextUrl.searchParams;
  const parsed = listQuerySchema.safeParse({
    page: sp.get("page") ?? undefined,
    pageSize: sp.get("pageSize") ?? opts.defaultPageSize ?? undefined,
    sort: sp.get("sort") ?? undefined,
    dir: sp.get("dir") ?? undefined,
  });
  if (!parsed.success) {
    return { success: false, error: validationFailed(parsed.error.issues) };
  }

  const { page, pageSize, sort, dir } = parsed.data;

  if (sort !== undefined && (!opts.sorts || !opts.sorts.includes(sort))) {
    return {
      success: false,
      error: validationFailed([{ message: `Invalid sort field: "${sort}"` }]),
    };
  }

  return {
    success: true,
    data: { page, pageSize, offset: (page - 1) * pageSize, sort, dir: dir ?? "desc" },
  };
}

/** Build the canonical list envelope from a page of rows and the total count. */
export function listEnvelope<T>(data: T[], total: number, page: number, pageSize: number) {
  return {
    data,
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

/** Convert a parsed ListQuery into service options. */
export function serviceOpts(q: ListQuery): ServiceListOpts {
  return { limit: q.pageSize, offset: q.offset, sort: q.sort, dir: q.dir };
}

/** Apply the requested direction to a sort column (services own the column map). */
export function orderByDir(column: Parameters<typeof asc>[0], dir: "asc" | "desc") {
  return dir === "asc" ? asc(column) : desc(column);
}
