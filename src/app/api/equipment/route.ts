import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware-helpers";
import { validateBody, createEquipmentSchema } from "@/lib/validation";
import { internalError } from "@/lib/api-error";
import { parseListQuery, serviceOpts, listEnvelope } from "@/lib/list-query";
import * as equipmentService from "@/services/equipment-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withAuth(request, "equipment.read", async () => {
    const parsed = parseListQuery(request);
    if (!parsed.success) return parsed.error;
    try {
      const { rows, total } = await equipmentService.listEquipment(serviceOpts(parsed.data));
      return NextResponse.json(listEnvelope(rows, total, parsed.data.page, parsed.data.pageSize));
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
