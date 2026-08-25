import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { invoices, payments, insuranceClaims, expenses } from "@/db/schema";
import { sql, count, sum } from "drizzle-orm";
import { withAuth } from "@/lib/middleware-helpers";
import { internalError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withAuth(request, "finance.read", async () => {
    try {
      const [invoiceStats] = await db
        .select({
          totalInvoiced: sum(invoices.totalAmount),
          totalPaid: sum(invoices.amountPaid),
          count: count(),
        })
        .from(invoices);

      const outstandingResult = await db.execute(sql`
        SELECT COALESCE(SUM(total_amount - amount_paid), 0) AS outstanding
        FROM invoices WHERE status != 'paid' AND status != 'written_off'
      `);
      const outstanding = Number((outstandingResult.rows[0] as { outstanding: string })?.outstanding ?? 0);

      const invoicesByStatus = await db
        .select({ status: invoices.status, count: count(), total: sum(invoices.totalAmount) })
        .from(invoices)
        .groupBy(invoices.status);

      const [paymentStats] = await db
        .select({ totalCollected: sum(payments.amount), count: count() })
        .from(payments);

      const paymentsByMethod = await db
        .select({ method: payments.method, total: sum(payments.amount), count: count() })
        .from(payments)
        .groupBy(payments.method);

      const claimsByStatus = await db
        .select({ status: insuranceClaims.status, count: count(), total: sum(insuranceClaims.amountClaimed) })
        .from(insuranceClaims)
        .groupBy(insuranceClaims.status);

      const [expenseStats] = await db
        .select({ total: sum(expenses.amount), count: count() })
        .from(expenses);

      const revenueByDay = await db.execute(sql`
        SELECT issue_date::text as date, SUM(total_amount)::text as total
        FROM invoices
        GROUP BY issue_date
        ORDER BY issue_date DESC
        LIMIT 14
      `);

      return NextResponse.json({
        totalInvoiced: Number(invoiceStats?.totalInvoiced ?? 0),
        totalPaid: Number(invoiceStats?.totalPaid ?? 0),
        invoiceCount: Number(invoiceStats?.count ?? 0),
        outstanding,
        totalCollected: Number(paymentStats?.totalCollected ?? 0),
        paymentCount: Number(paymentStats?.count ?? 0),
        totalExpenses: Number(expenseStats?.total ?? 0),
        expenseCount: Number(expenseStats?.count ?? 0),
        invoicesByStatus: invoicesByStatus.map((r) => ({ status: r.status, count: Number(r.count), total: Number(r.total ?? 0) })),
        paymentsByMethod: paymentsByMethod.map((r) => ({ method: r.method, count: Number(r.count), total: Number(r.total ?? 0) })),
        claimsByStatus: claimsByStatus.map((r) => ({ status: r.status, count: Number(r.count), total: Number(r.total ?? 0) })),
        revenueByDay: revenueByDay.rows,
      });
    } catch {
      return internalError();
    }
  });
}
