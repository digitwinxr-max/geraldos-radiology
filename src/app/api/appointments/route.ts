import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { appointments, patients, equipment, staff } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { withAuth } from "@/lib/middleware-helpers";
import { validateBody, createAppointmentSchema } from "@/lib/validation";
import { internalError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withAuth(request, "appointments.read", async () => {
    try {
      const result = await db
        .select({
          id: appointments.id,
          scheduledDate: appointments.scheduledDate,
          scheduledTime: appointments.scheduledTime,
          duration: appointments.duration,
          modality: appointments.modality,
          procedure: appointments.procedure,
          priority: appointments.priority,
          status: appointments.status,
          checkedIn: appointments.checkedIn,
          checkedInAt: appointments.checkedInAt,
          notes: appointments.notes,
          patientFirstName: patients.firstName,
          patientLastName: patients.lastName,
          patientMrn: patients.mrn,
          equipmentName: equipment.name,
          radiographerFirstName: staff.firstName,
          radiographerLastName: staff.lastName,
        })
        .from(appointments)
        .leftJoin(patients, eq(appointments.patientId, patients.id))
        .leftJoin(equipment, eq(appointments.equipmentId, equipment.id))
        .leftJoin(staff, eq(appointments.radiographerId, staff.id))
        .orderBy(desc(appointments.scheduledDate), appointments.scheduledTime);

      return NextResponse.json(result);
    } catch (error) {
      console.error("appointments GET failed", error);
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
    } catch (error) {
      console.error("appointments POST failed", error);
      return internalError();
    }
  });
}
