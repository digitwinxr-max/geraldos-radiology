import { NextResponse } from "next/server";
import { db } from "@/db";
import { reportTemplates } from "@/db/schema";
import { eq } from "drizzle-orm";
import { BUILT_IN_TEMPLATES } from "@/lib/reporting";

export const dynamic = "force-dynamic";

/** GET /api/reports/templates — built-in templates merged with DB-defined ones. */
export async function GET() {
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
  } catch (error) {
    return NextResponse.json({ ok: false, error: "failed to load templates", detail: String(error) }, { status: 500 });
  }
}
