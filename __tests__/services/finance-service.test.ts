import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", async () => {
  const { dbMock } = await import("../helpers/db-mock");
  return { db: dbMock.db };
});
vi.mock("@/lib/audit", () => ({
  recordAudit: vi.fn().mockResolvedValue(undefined),
}));

import { dbMock } from "../helpers/db-mock";
import { recordAudit } from "@/lib/audit";
import {
  createClaim,
  createExpense,
  createInvoice,
  createPayment,
  createTariff,
  getClaim,
  getFinanceAnalytics,
  getInvoice,
  getInvoiceLineItems,
  listClaims,
  listExpenses,
  listInvoices,
  listPayments,
  listTariffs,
  updateClaim,
} from "@/services/finance-service";

beforeEach(() => {
  dbMock.reset();
  vi.clearAllMocks();
});

const listOpts = { limit: 50, offset: 0, dir: "desc" as const };

describe("finance service", () => {
  describe("invoices", () => {
    it("listInvoices returns joined rows and total with pagination pass-through", async () => {
      dbMock.result([{ id: "i-1", invoiceNumber: "INV-001" }]);
      dbMock.result([{ count: 9 }]);

      const res = await listInvoices({ limit: 10, offset: 20, dir: "desc" });

      expect(res.rows).toHaveLength(1);
      expect(res.total).toBe(9);
      expect(dbMock.callsFor("leftJoin")).toHaveLength(1);
      expect(dbMock.callsFor("limit")[0].args).toEqual([10]);
      expect(dbMock.callsFor("offset")[0].args).toEqual([20]);
    });

    it("createInvoice inserts and returns the row", async () => {
      const input = { invoiceNumber: "INV-001", patientId: "p-1", issueDate: "2026-01-10" };
      const row = { id: "i-1", ...input };
      dbMock.result([row]);

      await expect(createInvoice(input)).resolves.toEqual(row);
      expect(dbMock.callsFor("values")[0].args).toEqual([input]);
    });

    it("getInvoice returns the row or null", async () => {
      dbMock.result([{ id: "i-1" }]);
      await expect(getInvoice("i-1")).resolves.toMatchObject({ id: "i-1" });

      dbMock.reset();
      dbMock.result([]);
      await expect(getInvoice("missing")).resolves.toBeNull();
    });

    it("getInvoiceLineItems returns the scripted line items", async () => {
      dbMock.result([{ id: "li-1", invoiceId: "i-1" }]);

      await expect(getInvoiceLineItems("i-1")).resolves.toEqual([
        { id: "li-1", invoiceId: "i-1" },
      ]);
    });
  });

  describe("payments", () => {
    it("listPayments returns joined rows and total", async () => {
      dbMock.result([{ id: "pay-1" }]);
      dbMock.result([{ count: 2 }]);

      const res = await listPayments(listOpts);

      expect(res.rows).toHaveLength(1);
      expect(res.total).toBe(2);
      expect(dbMock.callsFor("leftJoin")).toHaveLength(2);
    });

    it("createPayment inserts, updates the invoice paid amount, and audits", async () => {
      const input = {
        receiptNumber: "R-001",
        invoiceId: "i-1",
        patientId: "p-1",
        amount: "150.00",
        method: "card",
      };
      const row = { id: "pay-1", ...input };
      dbMock.result([row]); // insert().returning()
      dbMock.result([]); // invoice amountPaid update (awaited, no returning)

      const created = await createPayment(input);

      expect(created).toEqual(row);
      // Invoice amountPaid rollup issued against the payment's invoice.
      expect(dbMock.callsFor("update")).toHaveLength(1);
      const setArgs = dbMock.callsFor("set")[0].args[0] as Record<string, unknown>;
      expect(setArgs.amountPaid).toBeDefined();
      expect(recordAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "payment.received",
          module: "finance",
          entityType: "payment",
          entityId: "pay-1",
          details: { amount: "150.00", method: "card" },
        }),
      );
    });
  });

  describe("insurance claims", () => {
    const claimInput = {
      claimNumber: "C-001",
      invoiceId: "i-1",
      patientId: "p-1",
      medicalAid: "Discovery",
      amountClaimed: "1200.00",
    };

    it("listClaims returns joined rows and total", async () => {
      dbMock.result([{ id: "c-1" }]);
      dbMock.result([{ count: 5 }]);

      const res = await listClaims(listOpts);

      expect(res.total).toBe(5);
      expect(dbMock.callsFor("leftJoin")).toHaveLength(2);
    });

    it("createClaim inserts and returns the row", async () => {
      dbMock.result([{ id: "c-1", ...claimInput }]);

      await expect(createClaim(claimInput)).resolves.toMatchObject({ id: "c-1" });
    });

    it("getClaim returns the row or null", async () => {
      dbMock.result([{ id: "c-1" }]);
      await expect(getClaim("c-1")).resolves.toMatchObject({ id: "c-1" });

      dbMock.reset();
      dbMock.result([]);
      await expect(getClaim("missing")).resolves.toBeNull();
    });

    it("updateClaim applies updates and returns null when the claim is missing", async () => {
      dbMock.result([{ id: "c-1", status: "approved" }]);
      const updated = await updateClaim("c-1", { status: "approved" });
      expect(updated).toMatchObject({ status: "approved" });
      const setArgs = dbMock.callsFor("set")[0].args[0] as Record<string, unknown>;
      expect(setArgs.status).toBe("approved");
      expect(setArgs.updatedAt).toBeInstanceOf(Date);

      dbMock.reset();
      dbMock.result([]);
      await expect(updateClaim("missing", { status: "rejected" })).resolves.toBeNull();
    });
  });

  describe("tariffs and expenses", () => {
    it("listTariffs / createTariff round-trip rows and totals", async () => {
      dbMock.result([{ id: "t-1", code: "70001" }]);
      dbMock.result([{ count: 1 }]);
      const listed = await listTariffs(listOpts);
      expect(listed.total).toBe(1);

      dbMock.reset();
      const input = {
        code: "70001",
        description: "CT head",
        modality: "CT",
        cashPrice: "950.00",
        medicalAidPrice: "1100.00",
      };
      dbMock.result([{ id: "t-1", ...input }]);
      await expect(createTariff(input)).resolves.toMatchObject({ code: "70001" });
    });

    it("listExpenses / createExpense round-trip rows and totals", async () => {
      dbMock.result([{ id: "e-1" }]);
      dbMock.result([{ count: 3 }]);
      const listed = await listExpenses(listOpts);
      expect(listed.total).toBe(3);

      dbMock.reset();
      const input = {
        category: "supplies",
        description: "Contrast media",
        amount: "420.00",
        incurredDate: "2026-01-05",
      };
      dbMock.result([{ id: "e-1", ...input }]);
      await expect(createExpense(input)).resolves.toMatchObject({ id: "e-1" });
    });
  });

  describe("getFinanceAnalytics", () => {
    it("aggregates totals and status breakdowns from the six queries", async () => {
      dbMock.result([{ total: "15000.00" }]); // totalRevenue
      dbMock.result([{ total: "6000.00" }]); // totalPaid
      dbMock.result([{ total: "8000.00" }]); // totalClaims
      dbMock.result([{ total: "1200.00" }]); // totalExpenses
      dbMock.result([
        { status: "paid", count: 4 },
        { status: "outstanding", count: 2 },
      ]);
      dbMock.result([{ status: "submitted", count: 3 }]);

      const res = await getFinanceAnalytics();

      expect(res.totalRevenue).toBe("15000.00");
      expect(res.totalPaid).toBe("6000.00");
      expect(res.totalClaims).toBe("8000.00");
      expect(res.totalExpenses).toBe("1200.00");
      expect(res.invoicesByStatus).toEqual([
        { status: "paid", count: 4 },
        { status: "outstanding", count: 2 },
      ]);
      expect(res.claimsByStatus).toEqual([{ status: "submitted", count: 3 }]);
      expect(dbMock.callsFor("groupBy")).toHaveLength(2);
    });
  });
});
