import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware-helpers";
import { notFound, internalError } from "@/lib/api-error";
import { getInvoice, getInvoiceLineItems } from "@/services/finance-service";
import { db } from "@/db";
import { invoices } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(request, "finance.read", async () => {
    const { id } = await params;
    try {
      const invoice = await getInvoice(id);
      if (!invoice) return notFound("invoice");
      const lineItems = await getInvoiceLineItems(id);
      return NextResponse.json({ data: { ...invoice, lineItems } });
    } catch {
      return internalError();
    }
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(request, "finance.write", async () => {
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: { code: "VALIDATION_FAILED", message: "Request body required" } }, { status: 400 });
    }
    try {
      const result = await db
        .update(invoices)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(invoices.id, id))
        .returning();
      if (result.length === 0) return notFound("invoice");
      return NextResponse.json({ data: result[0] });
    } catch {
      return internalError();
    }
  });
}
