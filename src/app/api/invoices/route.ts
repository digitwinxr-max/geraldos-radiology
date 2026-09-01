import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { invoices, invoiceLineItems } from "@/db/schema";
import { withAuth } from "@/lib/middleware-helpers";
import { internalError } from "@/lib/api-error";
import { parseListQuery, listEnvelope, serviceOpts } from "@/lib/list-query";
import { listInvoices } from "@/services/finance-service";
import { generateInvoiceNumber } from "@/lib/finance";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withAuth(request, "finance.read", async () => {
    const parsed = parseListQuery(request, { sorts: ["issueDate", "totalAmount"] });
    if (!parsed.success) return parsed.error;

    try {
      const { rows, total } = await listInvoices(serviceOpts(parsed.data));
      return NextResponse.json(listEnvelope(rows, total, parsed.data.page, parsed.data.pageSize));
    } catch (error) {
      return internalError(error);
    }
  });
}

interface LineItemInput {
  description: string;
  quantity: number;
  unitPrice: number;
  tariffId?: string;
}

export async function POST(request: NextRequest) {
  return withAuth(request, "finance.write", async () => {
    const body = await request.json().catch(() => null);
    if (!body?.patientId) {
      return NextResponse.json({ error: { code: "VALIDATION_FAILED", message: "patientId is required" } }, { status: 400 });
    }

    try {
      const lineItems: LineItemInput[] = body.lineItems ?? [];
      const subtotal = lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
      // Botswana VAT is 14% (see src/app/api/seed/route.ts VAT_RATE).
      const VAT_RATE = 0.14;
      const taxAmount = Math.round(subtotal * VAT_RATE * 100) / 100;
      const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;

      const [invoice] = await db
        .insert(invoices)
        .values({
          invoiceNumber: generateInvoiceNumber(),
          patientId: body.patientId,
          studyId: body.studyId ?? null,
          appointmentId: body.appointmentId ?? null,
          billingType: body.billingType ?? "cash",
          insuranceProvider: body.insuranceProvider ?? null,
          insurancePolicyNumber: body.insurancePolicyNumber ?? null,
          subtotal: subtotal.toFixed(2),
          taxAmount: taxAmount.toFixed(2),
          totalAmount: totalAmount.toFixed(2),
          status: "sent",
          issueDate: body.issueDate ?? new Date().toISOString().split("T")[0],
          dueDate: body.dueDate ?? null,
          notes: body.notes ?? null,
        })
        .returning();

      if (lineItems.length > 0) {
        await db.insert(invoiceLineItems).values(
          lineItems.map((li) => ({
            invoiceId: invoice.id,
            tariffId: li.tariffId ?? null,
            description: li.description,
            quantity: li.quantity,
            unitPrice: li.unitPrice.toFixed(2),
            lineTotal: (li.quantity * li.unitPrice).toFixed(2),
          })),
        );
      }

      await recordAudit({
        action: "invoice.created",
        module: "finance",
        entityType: "invoice",
        entityId: invoice.id,
        details: { invoiceNumber: invoice.invoiceNumber, totalAmount },
      });

      return NextResponse.json({ data: invoice }, { status: 201 });
    } catch (error) {
      return internalError(error);
    }
  });
}
