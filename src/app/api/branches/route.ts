import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware-helpers";
import { validateBody, createBranchSchema } from "@/lib/validation";
import { internalError } from "@/lib/api-error";
import { parseListQuery, serviceOpts, listEnvelope } from "@/lib/list-query";
import * as staffService from "@/services/staff-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withAuth(request, "administration.read", async () => {
    const parsed = parseListQuery(request);
    if (!parsed.success) return parsed.error;
    try {
      const { rows, total } = await staffService.listBranches(serviceOpts(parsed.data));
      return NextResponse.json(listEnvelope(rows, total, parsed.data.page, parsed.data.pageSize));
    } catch (error) {
      return internalError(error);
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, "administration.write", async () => {
    const v = await validateBody(request, createBranchSchema);
    if (!v.success) return v.error;

    try {
      const row = await staffService.createBranch(v.data);
      return NextResponse.json({ data: row }, { status: 201 });
    } catch (error) {
      return internalError(error);
    }
  });
}
