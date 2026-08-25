/**
 * GeraldOS Finance Service
 *
 * Encapsulates invoices, payments, insurance claims, tariffs, and expenses.
 */

import { db } from "@/db";
import {
  invoices, invoiceLineItems, payments, insuranceClaims,
  tariffs, expenses, patients,
} from "@/db/schema";
import { eq, desc, sql, count } from "drizzle-orm";
import { recordAudit } from "@/lib/audit";

// ─── Invoices ───

export async function listInvoices(opts: { limit?: number } = {}) {
  const limit = opts.limit ?? 100;
  return db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      patientId: invoices.patientId,
      patientName: sql<string>`concat(${patients.firstName}, ' ', ${patients.lastName})`,
      billingType: invoices.billingType,
      subtotal: invoices.subtotal,
      taxAmount: invoices.taxAmount,
      totalAmount: invoices.totalAmount,
      amountPaid: invoices.amountPaid,
      status: invoices.status,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      createdAt: invoices.createdAt,
    })
    .from(invoices)
    .leftJoin(patients, eq(invoices.patientId, patients.id))
    .orderBy(desc(invoices.createdAt))
    .limit(limit);
}

export async function createInvoice(input: typeof invoices.$inferInsert) {
  const [row] = await db.insert(invoices).values(input).returning();
  return row;
}

export async function getInvoice(id: string) {
  const [row] = await db.select().from(invoices).where(eq(invoices.id, id));
  return row ?? null;
}

export async function getInvoiceLineItems(invoiceId: string) {
  return db.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, invoiceId));
}

// ─── Payments ───

export async function listPayments(opts: { limit?: number } = {}) {
  const limit = opts.limit ?? 100;
  return db.select().from(payments).orderBy(desc(payments.receivedAt)).limit(limit);
}

export async function createPayment(input: typeof payments.$inferInsert) {
  const [row] = await db.insert(payments).values(input).returning();

  // Update invoice paid amount
  await db
    .update(invoices)
    .set({
      amountPaid: sql`${invoices.amountPaid}::numeric + ${row.amount}::numeric`,
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, row.invoiceId));

  await recordAudit({
    action: "payment.received",
    module: "finance",
    entityType: "payment",
    entityId: row.id,
    details: { amount: row.amount, method: row.method },
  });

  return row;
}

// ─── Insurance Claims ───

export async function listClaims(opts: { limit?: number } = {}) {
  const limit = opts.limit ?? 100;
  return db.select().from(insuranceClaims).orderBy(desc(insuranceClaims.createdAt)).limit(limit);
}

export async function createClaim(input: typeof insuranceClaims.$inferInsert) {
  const [row] = await db.insert(insuranceClaims).values(input).returning();
  return row;
}

export async function getClaim(id: string) {
  const [row] = await db.select().from(insuranceClaims).where(eq(insuranceClaims.id, id));
  return row ?? null;
}

export async function updateClaim(id: string, updates: Partial<typeof insuranceClaims.$inferInsert>) {
  const [row] = await db
    .update(insuranceClaims)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(insuranceClaims.id, id))
    .returning();
  return row ?? null;
}

// ─── Tariffs ───

export async function listTariffs() {
  return db.select().from(tariffs).orderBy(tariffs.code);
}

export async function createTariff(input: typeof tariffs.$inferInsert) {
  const [row] = await db.insert(tariffs).values(input).returning();
  return row;
}

// ─── Expenses ───

export async function listExpenses(opts: { limit?: number } = {}) {
  const limit = opts.limit ?? 100;
  return db.select().from(expenses).orderBy(desc(expenses.incurredDate)).limit(limit);
}

export async function createExpense(input: typeof expenses.$inferInsert) {
  const [row] = await db.insert(expenses).values(input).returning();
  return row;
}

// ─── Finance analytics ───

export async function getFinanceAnalytics() {
  const [totalRevenue] = await db.select({ total: sql<string>`coalesce(sum(${invoices.totalAmount}::numeric), 0)` }).from(invoices);
  const [totalPaid] = await db.select({ total: sql<string>`coalesce(sum(${invoices.amountPaid}::numeric), 0)` }).from(invoices);
  const [totalClaims] = await db.select({ total: sql<string>`coalesce(sum(${insuranceClaims.amountClaimed}::numeric), 0)` }).from(insuranceClaims);
  const [totalExpenses] = await db.select({ total: sql<string>`coalesce(sum(${expenses.amount}::numeric), 0)` }).from(expenses);

  const invoicesByStatus = await db
    .select({ status: invoices.status, count: count() })
    .from(invoices)
    .groupBy(invoices.status);

  const claimsByStatus = await db
    .select({ status: insuranceClaims.status, count: count() })
    .from(insuranceClaims)
    .groupBy(insuranceClaims.status);

  return {
    totalRevenue: totalRevenue.total,
    totalPaid: totalPaid.total,
    totalClaims: totalClaims.total,
    totalExpenses: totalExpenses.total,
    invoicesByStatus,
    claimsByStatus,
  };
}
