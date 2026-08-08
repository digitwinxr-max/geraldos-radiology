import { NextResponse } from "next/server";
import { db } from "@/db";
import { patients, appointments, workflowStudies, equipment, inventoryItems, reports } from "@/db/schema";
import { sql, eq, count } from "drizzle-orm";

export async function GET() {
  try {
    const [patientCount] = await db.select({ count: count() }).from(patients);
    const [appointmentCount] = await db.select({ count: count() }).from(appointments);
    const [studyCount] = await db.select({ count: count() }).from(workflowStudies);
    const [equipmentCount] = await db.select({ count: count() }).from(equipment);
    const [reportCount] = await db.select({ count: count() }).from(reports);

    const lowStockItems = await db
      .select()
      .from(inventoryItems)
      .where(sql`${inventoryItems.currentStock} <= ${inventoryItems.minimumStock}`);

    const equipmentByStatus = await db
      .select({
        status: equipment.status,
        count: count(),
      })
      .from(equipment)
      .groupBy(equipment.status);

    const studiesByStage = await db
      .select({
        stage: workflowStudies.stage,
        count: count(),
      })
      .from(workflowStudies)
      .groupBy(workflowStudies.stage);

    const studiesByModality = await db
      .select({
        modality: workflowStudies.modality,
        count: count(),
      })
      .from(workflowStudies)
      .groupBy(workflowStudies.modality);

    return NextResponse.json({
      patients: patientCount.count,
      appointments: appointmentCount.count,
      studies: studyCount.count,
      equipment: equipmentCount.count,
      reports: reportCount.count,
      lowStockItems: lowStockItems.length,
      equipmentByStatus,
      studiesByStage,
      studiesByModality,
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}
