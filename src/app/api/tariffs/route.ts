import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware-helpers";
import { validateBody, createTariffSchema } from "@/lib/validation";
import { internalError } from "@/lib/api-error";
import * as financeService from "@/services/finance-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withAuth(request, "finance.read", async () => {
    try {
      const rows = await financeService.listTariffs();
      return NextResponse.json({ data: rows });
    } catch {
      return internalError();
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, "finance.write", async () => {
    const v = await validateBody(request, createTariffSchema);
    if (!v.success) return v.error;

    try {
      const row = await financeService.createTariff(v.data);
      return NextResponse.json({ data: row }, { status: 201 });
    } catch {
      return internalError();
    }
  });
}
