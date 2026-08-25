import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { patients } from "@/db/schema";
import { withAuth } from "@/lib/middleware-helpers";
import { validateBody, createPatientSchema, searchSchema } from "@/lib/validation";
import { internalError } from "@/lib/api-error";
import { parseListQuery, listEnvelope, serviceOpts } from "@/lib/list-query";
import { listPatients } from "@/services/patients";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withAuth(request, "patients.read", async () => {
    const parsed = parseListQuery(request, { sorts: ["createdAt", "lastName"] });
    if (!parsed.success) return parsed.error;

    const rawSearch = request.nextUrl.searchParams.get("search") ?? "";
    const searchParsed = searchSchema.safeParse({ search: rawSearch });
    const search = searchParsed.success ? searchParsed.data.search : "";

    try {
      const { rows, total } = await listPatients({ ...serviceOpts(parsed.data), search });
      return NextResponse.json(listEnvelope(rows, total, parsed.data.page, parsed.data.pageSize));
    } catch {
      return internalError();
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, "patients.write", async () => {
    const parsed = await validateBody(request, createPatientSchema);
    if (!parsed.success) return parsed.error;

    try {
      const result = await db.insert(patients).values(parsed.data).returning();
      return NextResponse.json(result[0], { status: 201 });
    } catch {
      return internalError();
    }
  });
}
