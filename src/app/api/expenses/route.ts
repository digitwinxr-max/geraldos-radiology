import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware-helpers";
import { validateBody, createExpenseSchema } from "@/lib/validation";
import { internalError } from "@/lib/api-error";
import { parseListQuery, listEnvelope, serviceOpts } from "@/lib/list-query";
import * as financeService from "@/services/finance-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withAuth(request, "finance.read", async () => {
    const parsed = parseListQuery(request);
    if (!parsed.success) return parsed.error;

    try {
      const { rows, total } = await financeService.listExpenses(serviceOpts(parsed.data));
      return NextResponse.json(listEnvelope(rows, total, parsed.data.page, parsed.data.pageSize));
    } catch {
      return internalError();
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, "finance.write", async () => {
    const v = await validateBody(request, createExpenseSchema);
    if (!v.success) return v.error;

    try {
      const row = await financeService.createExpense(v.data);
      return NextResponse.json({ data: row }, { status: 201 });
    } catch {
      return internalError();
    }
  });
}
