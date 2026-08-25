import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { systemSettings } from "@/db/schema";
import { withAuth } from "@/lib/middleware-helpers";
import { validateBody, updateSystemSettingsSchema } from "@/lib/validation";
import { internalError } from "@/lib/api-error";
import { z } from "zod";

export const dynamic = "force-dynamic";

const putSettingSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.unknown(),
  updatedBy: z.string().max(100).optional(),
});

export async function GET(request: NextRequest) {
  return withAuth(request, "administration.read", async () => {
    try {
      const result = await db.select().from(systemSettings);
      const settingsMap: Record<string, unknown> = {};
      result.forEach((s) => { settingsMap[s.key] = s.value; });
      return NextResponse.json({ data: settingsMap });
    } catch (error) {
      return internalError(error);
    }
  });
}

export async function PUT(request: NextRequest) {
  return withAuth(request, "administration.write", async (user) => {
    const v = await validateBody(request, putSettingSchema);
    if (!v.success) return v.error;

    try {
      await db
        .insert(systemSettings)
        .values({ key: v.data.key, value: v.data.value, updatedBy: v.data.updatedBy ?? user.sub, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: { value: v.data.value, updatedBy: v.data.updatedBy ?? user.sub, updatedAt: new Date() },
        });
      return NextResponse.json({ ok: true });
    } catch (error) {
      return internalError(error);
    }
  });
}
