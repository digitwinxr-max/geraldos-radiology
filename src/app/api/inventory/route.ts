import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware-helpers";
import { validateBody, createInventoryItemSchema } from "@/lib/validation";
import { internalError } from "@/lib/api-error";
import { parseListQuery, serviceOpts, listEnvelope } from "@/lib/list-query";
import * as inventoryService from "@/services/inventory-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withAuth(request, "inventory.read", async () => {
    const parsed = parseListQuery(request);
    if (!parsed.success) return parsed.error;
    try {
      const { rows, total } = await inventoryService.listInventory(serviceOpts(parsed.data));
      return NextResponse.json(listEnvelope(rows, total, parsed.data.page, parsed.data.pageSize));
    } catch (error) {
      return internalError(error);
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, "inventory.write", async () => {
    const v = await validateBody(request, createInventoryItemSchema);
    if (!v.success) return v.error;

    try {
      const row = await inventoryService.createInventoryItem(v.data);
      return NextResponse.json({ data: row }, { status: 201 });
    } catch (error) {
      return internalError(error);
    }
  });
}
