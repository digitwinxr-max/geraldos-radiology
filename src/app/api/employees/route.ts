import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { employeeRecords, staff } from "@/db/schema";
import { withAuth } from "@/lib/middleware-helpers";
import { internalError } from "@/lib/api-error";
import { parseListQuery, serviceOpts, listEnvelope } from "@/lib/list-query";
import * as staffService from "@/services/staff-service";
import { generateEmployeeNumber } from "@/lib/finance";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withAuth(request, "administration.read", async () => {
    const parsed = parseListQuery(request);
    if (!parsed.success) return parsed.error;
    try {
      const { rows, total } = await staffService.listEmployees(serviceOpts(parsed.data));
      return NextResponse.json(listEnvelope(rows, total, parsed.data.page, parsed.data.pageSize));
    } catch (error) {
      return internalError(error);
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, "administration.write", async (user) => {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: { code: "VALIDATION_FAILED", message: "Request body is required" } }, { status: 400 });
    }

    try {
      // Support two modes:
      // 1. Link existing staff: { staffId: "...", department, branchId, ... }
      // 2. Create new staff + employee: { newStaff: { firstName, lastName, role, ... }, department, branchId, ... }
      let staffId: string = body.staffId;

      if (body.newStaff) {
        // Create the staff member first
        const [newStaff] = await db
          .insert(staff)
          .values({
            firstName: body.newStaff.firstName,
            lastName: body.newStaff.lastName,
            role: body.newStaff.role,
            specialization: body.newStaff.specialization ?? null,
            email: body.newStaff.email ?? null,
            phone: body.newStaff.phone ?? null,
          })
          .returning();
        staffId = newStaff.id;
      }

      if (!staffId) {
        return NextResponse.json(
          { error: { code: "VALIDATION_FAILED", message: "staffId or newStaff is required" } },
          { status: 400 },
        );
      }

      const [row] = await db
        .insert(employeeRecords)
        .values({
          staffId,
          employeeNumber: generateEmployeeNumber(),
          department: body.department ?? null,
          employmentType: body.employmentType ?? "full_time",
          branchId: body.branchId ?? null,
          startDate: body.startDate ?? new Date().toISOString().split("T")[0],
          hourlyRate: body.hourlyRate ?? null,
          monthlySalary: body.monthlySalary ?? null,
        })
        .returning();
      return NextResponse.json({ data: row }, { status: 201 });
    } catch (error) {
      return internalError(error);
    }
  });
}
