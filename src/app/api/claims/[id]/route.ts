import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { insuranceClaims } from "@/db/schema";
import { eq } from "drizzle-orm";
import { withAuth } from "@/lib/middleware-helpers";
import { notFound, internalError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(request, "finance.write", async () => {
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: { code: "VALIDATION_FAILED", message: "Request body required" } }, { status: 400 });
    }

    try {
      const updates: Record<string, unknown> = { ...body, updatedAt: new Date() };
      if (body.status && body.status !== "submitted" && body.status !== "pending") {
        updates.respondedAt = new Date();
      }
      const result = await db.update(insuranceClaims).set(updates).where(eq(insuranceClaims.id, id)).returning();
      if (result.length === 0) return notFound("claim");
      return NextResponse.json({ data: result[0] });
    } catch {
      return internalError();
    }
  });
}
