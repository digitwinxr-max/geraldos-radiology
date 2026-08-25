import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware-helpers";
import { validateBody, createEquipmentSchema } from "@/lib/validation";
import { internalError } from "@/lib/api-error";
import * as equipmentService from "@/services/equipment-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withAuth(request, "equipment.read", async () => {
    try {
      const rows = await equipmentService.listEquipment();
      return NextResponse.json({ data: rows });
    } catch {
      return internalError();
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, "equipment.write", async () => {
    const v = await validateBody(request, createEquipmentSchema);
    if (!v.success) return v.error;

    try {
      const row = await equipmentService.createEquipment(v.data);
      return NextResponse.json({ data: row }, { status: 201 });
    } catch {
      return internalError();
    }
  });
}
