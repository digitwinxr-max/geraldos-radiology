import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware-helpers";
import { validateBody, createBranchSchema } from "@/lib/validation";
import { internalError } from "@/lib/api-error";
import * as staffService from "@/services/staff-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withAuth(request, "administration.read", async () => {
    try {
      const rows = await staffService.listBranches();
      return NextResponse.json({ data: rows });
    } catch {
      return internalError();
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
    } catch {
      return internalError();
    }
  });
}
