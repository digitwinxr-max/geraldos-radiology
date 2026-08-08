import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { appointments, patients, equipment, staff } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const dateFilter = request.nextUrl.searchParams.get("date") || "";

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
    return NextResponse.json({ error: "Failed to fetch appointments" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await db.insert(appointments).values(body).returning();
    return NextResponse.json(result[0], { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create appointment" }, { status: 500 });
  }
}
