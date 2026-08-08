/**
 * GeraldOS Operations Command Centre — real-time operational snapshot.
 *
 * Aggregates patient flow, queue status, machine utilisation, equipment health,
 * pending reports, radiologist workload, referral sources, revenue, appointment
 * delays, emergency cases, inventory alerts, maintenance alerts, live AI
 * recommendations and operational risks into a single snapshot payload.
 */

import { db } from "@/db";
import {
  patients,
  appointments,
  workflowStudies,
  equipment,
  staff,
  inventoryItems,
  maintenanceRecords,
  reports,
  invoices,
  referrals,
  insuranceClaims,
} from "@/db/schema";
import { count, eq, sql, sum, desc, and } from "drizzle-orm";
import { aiRecommendations } from "@/db/schema";

export interface CommandCentreSnapshot {
  generatedAt: string;
  kpis: {
    patientsToday: number;
    appointmentsToday: number;
    checkedIn: number;
    activeStudies: number;
    pendingReports: number;
    emergencyCases: number;
    revenueToday: number;
    lowStockAlerts: number;
    maintenanceOpen: number;
    equipmentOperational: number;
    equipmentTotal: number;
  };
  patientFlow: { stage: string; count: number }[];
  queue: { equipmentName: string; modality: string; waiting: number; inProgress: number; status: string }[];
  machineUtilisation: { equipmentName: string; modality: string; utilisation: number; status: string }[];
  radiologistWorkload: { name: string; assigned: number; signedToday: number }[];
  referralSources: { physician: string; count: number }[];
  appointmentDelays: { id: string; patientName: string; scheduledTime: string; delayMinutes: number; status: string }[];
  inventoryAlerts: { name: string; currentStock: number; minimumStock: number }[];
  maintenanceAlerts: { equipmentName: string | null; type: string; status: string }[];
  liveAIRecommendations: { id: string; agent: string; recommendation: string; priority: string; status: string }[];
  operationalRisks: { severity: "critical" | "high" | "medium" | "low"; title: string; detail: string }[];
}

export async function getCommandCentreSnapshot(): Promise<CommandCentreSnapshot> {
  const today = new Date().toISOString().split("T")[0];

  const [patientsToday] = await db.select({ count: count() }).from(patients).where(sql`${patients.createdAt}::date = ${today}::date`);
  const todayAppointments = await db.select().from(appointments).where(eq(appointments.scheduledDate, today));
  const [activeStudies] = await db.select({ count: count() }).from(workflowStudies).where(sql`${workflowStudies.stage} NOT IN ('released','archived')`);
  const [pendingReports] = await db.select({ count: count() }).from(reports).where(sql`${reports.status} IN ('draft','pending_review')`);
  const [emergencyCases] = await db
    .select({ count: count() })
    .from(workflowStudies)
    .where(sql`${workflowStudies.priority} = 'stat' AND ${workflowStudies.stage} NOT IN ('released','archived')`);
  const [revenueToday] = await db
    .select({ total: sum(invoices.totalAmount) })
    .from(invoices)
    .where(eq(invoices.issueDate, today));
  const lowStock = await db.select().from(inventoryItems).where(sql`${inventoryItems.currentStock} <= ${inventoryItems.minimumStock}`);
  const [maintenanceOpen] = await db.select({ count: count() }).from(maintenanceRecords).where(sql`${maintenanceRecords.status} IN ('scheduled','in_progress')`);

  // Machine utilisation + queue
  const equipmentRows = await db.select().from(equipment);
  const equipmentIds = await db
    .select({ id: equipment.id, name: equipment.name })
    .from(equipment);
  const queueRows = await Promise.all(
    equipmentIds.map(async ({ id, name }) => {
      const [waiting] = await db
        .select({ count: count() })
        .from(appointments)
        .where(and(eq(appointments.equipmentId, id), eq(appointments.status, "scheduled")));
      const [inProgress] = await db
        .select({ count: count() })
        .from(appointments)
        .where(and(eq(appointments.equipmentId, id), eq(appointments.status, "in_progress")));
      const equipRow = equipmentRows.find((e) => e.id === id);
      return {
        equipmentName: name,
        modality: equipRow?.modality ?? "—",
        waiting: Number(waiting.count),
        inProgress: Number(inProgress.count),
        status: equipRow?.status ?? "operational",
      };
    })
  );

  // Radiologist workload
  const radiologists = await db.select().from(staff).where(sql`${staff.role} = 'radiologist'`);
  const radiologistWorkload = await Promise.all(
    radiologists.map(async (r) => {
      const [assigned] = await db
        .select({ count: count() })
        .from(workflowStudies)
        .where(and(eq(workflowStudies.radiologistId, r.id), sql`${workflowStudies.stage} NOT IN ('released','archived')`));
      const [signedToday] = await db
        .select({ count: count() })
        .from(reports)
        .where(and(eq(reports.radiologistId, r.id), sql`${reports.signedAt}::date = ${today}::date`));
      return { name: `Dr. ${r.firstName} ${r.lastName}`, assigned: Number(assigned.count), signedToday: Number(signedToday.count) };
    })
  );

  // Referral sources
  const referralRows = await db
    .select({ physician: referrals.referringPhysician, count: count() })
    .from(referrals)
    .groupBy(referrals.referringPhysician)
    .orderBy(desc(sql`count(*)`))
    .limit(8);

  // Appointment delays (scheduled, now past due, not started)
  const nowTime = new Date().toTimeString().slice(0, 5);
  const delayed = todayAppointments.filter((a) => a.status === "scheduled" && a.scheduledTime < nowTime);
  const patientMap = new Map((await db.select({ id: patients.id, firstName: patients.firstName, lastName: patients.lastName }).from(patients)).map((p) => [p.id, p]));
  const appointmentDelays = delayed.slice(0, 10).map((a) => {
    const [h, m] = a.scheduledTime.split(":").map(Number);
    const [nh, nm] = nowTime.split(":").map(Number);
    const delayMinutes = Math.max(0, nh * 60 + nm - (h * 60 + m));
    const p = patientMap.get(a.patientId);
    return { id: a.id, patientName: p ? `${p.firstName} ${p.lastName}` : "Unknown", scheduledTime: a.scheduledTime, delayMinutes, status: a.status };
  });

  // Live AI recommendations awaiting attention
  const liveAIRecommendations = await db
    .select()
    .from(aiRecommendations)
    .where(sql`${aiRecommendations.status} IN ('proposed','validated','approved')`)
    .orderBy(desc(aiRecommendations.createdAt))
    .limit(8);

  // Maintenance alerts
  const maintenanceRows = await db
    .select({
      equipmentName: equipment.name,
      type: maintenanceRecords.type,
      status: maintenanceRecords.status,
    })
    .from(maintenanceRecords)
    .leftJoin(equipment, eq(maintenanceRecords.equipmentId, equipment.id))
    .where(sql`${maintenanceRecords.status} IN ('scheduled','in_progress')`)
    .limit(8);

  // Operational risks
  const operationalRisks: CommandCentreSnapshot["operationalRisks"] = [];
  const eqOffline = equipmentRows.filter((e) => e.status === "offline");
  const eqMaintenance = equipmentRows.filter((e) => e.status === "maintenance");
  if (eqOffline.length > 0) operationalRisks.push({ severity: "critical", title: `${eqOffline.length} machine(s) offline`, detail: eqOffline.map((e) => `${e.name} (${e.location ?? "unknown location"})`).join(", ") });
  if (eqMaintenance.length > 0) operationalRisks.push({ severity: "high", title: `${eqMaintenance.length} machine(s) in maintenance`, detail: eqMaintenance.map((e) => e.name).join(", ") });
  if (lowStock.length > 0) operationalRisks.push({ severity: "high", title: `${lowStock.length} inventory items below minimum`, detail: lowStock.map((i) => i.name).join(", ") });
  if (appointmentDelays.length > 0) operationalRisks.push({ severity: "medium", title: `${appointmentDelays.length} appointment(s) running late`, detail: `Longest delay ${Math.max(...appointmentDelays.map((d) => d.delayMinutes))} min` });
  const [claimsPending] = await db.select({ count: count() }).from(insuranceClaims).where(sql`${insuranceClaims.status} IN ('submitted','pending')`);
  if (Number(claimsPending.count) > 0) operationalRisks.push({ severity: "medium", title: `${claimsPending.count} insurance claims awaiting response`, detail: "Revenue at risk pending medical aid decisions" });
  if (Number(pendingReports.count) > 0) operationalRisks.push({ severity: "medium", title: `${pendingReports.count} reports pending`, detail: "Reports awaiting radiologist attention may breach TAT" });
  if (operationalRisks.length === 0) operationalRisks.push({ severity: "low", title: "All systems nominal", detail: "No active operational risks detected" });

  const machineUtilisation = equipmentRows.map((e) => ({
    equipmentName: e.name,
    modality: e.modality,
    utilisation: Number(e.utilizationRate ?? 0),
    status: e.status,
  }));

  return {
    generatedAt: new Date().toISOString(),
    kpis: {
      patientsToday: Number(patientsToday.count),
      appointmentsToday: todayAppointments.length,
      checkedIn: todayAppointments.filter((a) => a.checkedIn).length,
      activeStudies: Number(activeStudies.count),
      pendingReports: Number(pendingReports.count),
      emergencyCases: Number(emergencyCases.count),
      revenueToday: Number(revenueToday?.total ?? 0),
      lowStockAlerts: lowStock.length,
      maintenanceOpen: Number(maintenanceOpen.count),
      equipmentOperational: equipmentRows.filter((e) => e.status === "operational").length,
      equipmentTotal: equipmentRows.length,
    },
    patientFlow: await (async () => {
      const rows = await db
        .select({ stage: workflowStudies.stage, count: count() })
        .from(workflowStudies)
        .groupBy(workflowStudies.stage);
      return rows as { stage: string; count: number }[];
    })(),
    queue: queueRows,
    machineUtilisation,
    radiologistWorkload,
    referralSources: referralRows as { physician: string; count: number }[],
    appointmentDelays,
    inventoryAlerts: lowStock.map((i) => ({ name: i.name, currentStock: i.currentStock, minimumStock: i.minimumStock })),
    maintenanceAlerts: maintenanceRows,
    liveAIRecommendations,
    operationalRisks,
  };
}

