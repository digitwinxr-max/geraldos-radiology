import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { roles } from "@/db/schema";
import { withAuth } from "@/lib/middleware-helpers";
import { internalError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

function normalizePermissions(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === "string");
      if (parsed && typeof parsed === "object") return Object.keys(parsed).filter((k) => parsed[k] === true || typeof parsed[k] !== "boolean");
    } catch {
      /* not valid JSON */
    }
    return [];
  }
  if (value && typeof value === "object") {
    return Object.keys(value).filter((k) => (value as Record<string, unknown>)[k] !== false);
  }
  return [];
}

export async function GET(request: NextRequest) {
  return withAuth(request, "administration.read", async () => {
    try {
      const result = await db.select().from(roles).orderBy(roles.name);
      return NextResponse.json({
        data: result.map((r) => ({ ...r, permissions: normalizePermissions(r.permissions) })),
      });
    } catch {
      return internalError();
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, "administration.write", async () => {
    const body = await request.json().catch(() => null);
    if (!body?.name) {
      return NextResponse.json({ error: { code: "VALIDATION_FAILED", message: "name is required" } }, { status: 400 });
    }
    try {
      const [row] = await db
        .insert(roles)
        .values({
          name: body.name,
          description: body.description ?? null,
          permissions: Array.isArray(body.permissions) ? body.permissions : [],
          isSystem: false,
        })
        .returning();
      return NextResponse.json({ data: row }, { status: 201 });
    } catch {
      return internalError();
    }
  });
}
