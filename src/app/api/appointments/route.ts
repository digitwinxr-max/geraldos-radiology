import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { appointments } from "@/db/schema";
import { withAuth } from "@/lib/middleware-helpers";
import { validateBody, createAppointmentSchema } from "@/lib/validation";
import { internalError } from "@/lib/api-error";
import { parseListQuery, listEnvelope, serviceOpts } from "@/lib/list-query";
import { listAppointments } from "@/services/appointments";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withAuth(request, "appointments.read", async () => {
    const parsed = parseListQuery(request, { sorts: ["scheduledDate", "createdAt"] });
    if (!parsed.success) return parsed.error;

    try {
      const { rows, total } = await listAppointments(serviceOpts(parsed.data));
      return NextResponse.json(listEnvelope(rows, total, parsed.data.page, parsed.data.pageSize));
    } catch {
      return internalError();
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, "appointments.write", async () => {
    const parsed = await validateBody(request, createAppointmentSchema);
    if (!parsed.success) return parsed.error;

    try {
      const result = await db.insert(appointments).values(parsed.data).returning();
      return NextResponse.json(result[0], { status: 201 });
    } catch {
      return internalError();
    }
  });
}
