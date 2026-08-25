import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { payments, invoices } from "@/db/schema";
import { eq } from "drizzle-orm";
import { withAuth } from "@/lib/middleware-helpers";
import { internalError } from "@/lib/api-error";
import { parseListQuery, listEnvelope, serviceOpts } from "@/lib/list-query";
import { listPayments } from "@/services/finance-service";
import { generateReceiptNumber } from "@/lib/finance";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withAuth(request, "finance.read", async () => {
    const parsed = parseListQuery(request);
    if (!parsed.success) return parsed.error;

    try {
      const { rows, total } = await listPayments(serviceOpts(parsed.data));
      return NextResponse.json(listEnvelope(rows, total, parsed.data.page, parsed.data.pageSize));
    } catch {
      return internalError();
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, "finance.write", async () => {
    const body = await request.json().catch(() => null);
    if (!body?.invoiceId || !body?.patientId || !body?.amount || !body?.method) {
      return NextResponse.json({ error: { code: "VALIDATION_FAILED", message: "invoiceId, patientId, amount, and method are required" } }, { status: 400 });
    }

    try {
      const [payment] = await db
        .insert(payments)
        .values({
          receiptNumber: generateReceiptNumber(),
          invoiceId: body.invoiceId,
          patientId: body.patientId,
          amount: Number(body.amount).toFixed(2),
          method: body.method,
          reference: body.reference ?? null,
          receivedBy: body.receivedBy ?? "system",
          notes: body.notes ?? null,
        })
        .returning();

      // Update invoice paid amount & status
      const [invoice] = await db.select().from(invoices).where(eq(invoices.id, body.invoiceId));
      if (invoice) {
        const newPaid = parseFloat(invoice.amountPaid) + Number(body.amount);
        const total = parseFloat(invoice.totalAmount);
        const newStatus = newPaid >= total ? "paid" : newPaid > 0 ? "partial" : invoice.status;
        await db
          .update(invoices)
          .set({ amountPaid: newPaid.toFixed(2), status: newStatus, updatedAt: new Date() })
          .where(eq(invoices.id, body.invoiceId));
      }

      await recordAudit({
        action: "payment.recorded",
        module: "finance",
        entityType: "payment",
        entityId: payment.id,
        details: { receiptNumber: payment.receiptNumber, amount: body.amount, method: body.method },
      });

      return NextResponse.json({ data: payment }, { status: 201 });
    } catch {
      return internalError();
    }
  });
}
