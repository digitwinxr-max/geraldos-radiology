import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { reportTemplates } from "@/db/schema";
import { eq } from "drizzle-orm";
import { BUILT_IN_TEMPLATES } from "@/lib/reporting";
import { withAuth } from "@/lib/middleware-helpers";
import { internalError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

/** GET /api/reports/templates — built-in templates merged with DB-defined ones. */
export async function GET(request: NextRequest) {
  return withAuth(request, "reports.read", async () => {
    try {
      const custom = await db.select().from(reportTemplates).where(eq(reportTemplates.active, true));
      const merged = [
        ...BUILT_IN_TEMPLATES.map((t) => ({ ...t, isSystem: true })),
        ...custom.map((t) => ({
          id: t.id,
          name: t.name,
          modality: t.modality,
          description: t.description ?? "",
          sections: (t.sections as { name: string; hint?: string }[]) ?? [],
          checklist: (t.checklist as string[]) ?? [],
          isSystem: t.isSystem,
        })),
      ];
      return NextResponse.json({ ok: true, templates: merged });
    } catch {
      return internalError();
    }
  });
}
