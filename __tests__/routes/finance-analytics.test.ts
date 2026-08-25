import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/db", async () => {
  const { dbMock } = await import("../helpers/db-mock");
  return { db: dbMock.db };
});
vi.mock("@/lib/middleware-helpers", () => ({
  withAuth: vi.fn(),
}));

import { dbMock, mockUser } from "../helpers/db-mock";
import { withAuth } from "@/lib/middleware-helpers";
import { GET } from "@/app/api/finance/analytics/route";

function request() {
  return new NextRequest("http://localhost/api/finance/analytics");
}

beforeEach(() => {
  dbMock.reset();
  vi.clearAllMocks();
  // Default: authenticated pass-through with the mock administrator user.
  vi.mocked(withAuth).mockImplementation(async (_req, _permission, handler) => handler(mockUser));
});

describe("GET /api/finance/analytics", () => {
  it("requires the finance.read permission", async () => {
    dbMock.result([{ totalInvoiced: "0", totalPaid: "0", count: 0 }]);
    dbMock.result([{ outstanding: "0" }]);
    dbMock.result([]);
    dbMock.result([{ totalCollected: "0", count: 0 }]);
    dbMock.result([]);
    dbMock.result([]);
    dbMock.result([{ total: "0", count: 0 }]);
    dbMock.result([]);

    const req = request();
    await GET(req);

    const [authReq, permission, handler] = vi.mocked(withAuth).mock.calls[0] ?? [];
    expect(authReq).toBe(req);
    expect(permission).toBe("finance.read");
    expect(typeof handler).toBe("function");
  });

  it("returns 401 untouched when authentication fails", async () => {
    vi.mocked(withAuth).mockImplementationOnce(async () =>
      NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 }),
    );

    const res = await GET(request());

    expect(res.status).toBe(401);
    expect(dbMock.calls).toHaveLength(0);
  });

  it("coerces sums to numbers and maps the status/method breakdowns", async () => {
    dbMock.result([{ totalInvoiced: "15000.00", totalPaid: "6000.00", count: 10 }]);
    dbMock.result([{ outstanding: "9000.50" }]);
    dbMock.result([{ status: "paid", count: 4, total: "6000.00" }]);
    dbMock.result([{ totalCollected: "6000.00", count: 8 }]);
    dbMock.result([{ method: "card", count: 5, total: "4000.00" }]);
    dbMock.result([{ status: "submitted", count: 3, total: "3000.00" }]);
    dbMock.result([{ total: "1200.00", count: 2 }]);
    dbMock.result([{ date: "2026-01-10", total: "1500.00" }]);

    const res = await GET(request());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalInvoiced).toBe(15000);
    expect(body.totalPaid).toBe(6000);
    expect(body.invoiceCount).toBe(10);
    expect(body.outstanding).toBe(9000.5);
    expect(body.totalCollected).toBe(6000);
    expect(body.paymentCount).toBe(8);
    expect(body.totalExpenses).toBe(1200);
    expect(body.expenseCount).toBe(2);
    expect(body.invoicesByStatus).toEqual([{ status: "paid", count: 4, total: 6000 }]);
    expect(body.paymentsByMethod).toEqual([{ method: "card", count: 5, total: 4000 }]);
    expect(body.claimsByStatus).toEqual([{ status: "submitted", count: 3, total: 3000 }]);
    expect(body.revenueByDay).toEqual([{ date: "2026-01-10", total: "1500.00" }]);
  });

  it("defaults to zero when aggregate rows are empty", async () => {
    dbMock.result([]); // invoiceStats — destructures to undefined
    dbMock.result([]); // outstanding raw query
    dbMock.result([]);
    dbMock.result([]);
    dbMock.result([]);
    dbMock.result([]);
    dbMock.result([]);
    dbMock.result([]);

    const res = await GET(request());
    const body = await res.json();

    expect(body.totalInvoiced).toBe(0);
    expect(body.outstanding).toBe(0);
    expect(body.invoicesByStatus).toEqual([]);
  });

  it("returns a 500 envelope when the database throws", async () => {
    // A non-array result makes the destructuring select throw inside the handler.
    dbMock.result(new Error("db down"));

    const res = await GET(request());

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
  });
});
