import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware-helpers";
import { validateBody, createInventoryItemSchema } from "@/lib/validation";
import { internalError } from "@/lib/api-error";
import * as inventoryService from "@/services/inventory-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withAuth(request, "inventory.read", async () => {
    try {
      const rows = await inventoryService.listInventory();
      return NextResponse.json({ data: rows });
    } catch {
      return internalError();
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
    } catch {
      return internalError();
    }
  });
}
