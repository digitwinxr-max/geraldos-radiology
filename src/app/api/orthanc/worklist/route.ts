import { NextRequest, NextResponse } from "next/server";
import { integrationConfig, orthancAuthHeader, timedFetch } from "@/lib/integrations";
import { db } from "@/db";
import { appointments, patients, referrals } from "@/db/schema";
import { eq, sql, asc } from "drizzle-orm";
import { withAuth } from "@/lib/middleware-helpers";
import { internalError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

/**
 * GET /api/orthanc/worklist?modality=CT&date=2025-01-01
 *
 * Returns a DICOM Modality Worklist (MWL). When Orthanc is configured the query
 * is proxied to its worklist server; otherwise the local appointment schedule is
 * used as the worklist source so the platform works standalone.
 */
export async function GET(request: NextRequest) {
  return withAuth(request, "integrations.read", async () => {
    const { url } = integrationConfig.orthanc;
    const params = request.nextUrl.searchParams;
    const modality = params.get("modality") ?? undefined;
    const date = params.get("date") ?? new Date().toISOString().split("T")[0];

    // ── Remote: Orthanc worklist ──
    if (url) {
      try {
        const query = [
          `WorklistDate=${date}`,
          modality ? `Modality=${modality}` : "",
        ].filter(Boolean).join("&");
        const res = await timedFetch(
          `${url.replace(/\/$/, "")}/modalities/worklist/query${query ? `?${query}` : ""}`,
          { headers: { ...orthancAuthHeader() } },
          8000
        );
        if (res.ok) {
          const json = await res.json();
          return NextResponse.json({ ok: true, source: "orthanc", items: json });
        }
        // Fall through to local on upstream error.
      } catch {
        // Fall through to local.
      }
    }

    // ── Local fallback: scheduled appointments as worklist entries ──
    try {
      const rows = await db
        .select({
          id: appointments.id,
          scheduledDate: appointments.scheduledDate,
          scheduledTime: appointments.scheduledTime,
          modality: appointments.modality,
          procedure: appointments.procedure,
          priority: appointments.priority,
          status: appointments.status,
          patientFirstName: patients.firstName,
          patientLastName: patients.lastName,
          patientMrn: patients.mrn,
          patientDob: patients.dateOfBirth,
          patientGender: patients.gender,
          clinicalIndication: referrals.clinicalIndication,
        })
        .from(appointments)
        .leftJoin(patients, eq(appointments.patientId, patients.id))
        .leftJoin(referrals, eq(appointments.referralId, referrals.id))
        .where(
          sql`${appointments.scheduledDate} = ${date} AND ${appointments.status} NOT IN ('completed','cancelled')`
        )
        .orderBy(asc(appointments.scheduledTime));

      const filtered = modality ? rows.filter((r) => r.modality === modality) : rows;
      return NextResponse.json({ ok: true, source: "local", date, modality: modality ?? "all", items: filtered });
    } catch {
      return internalError();
    }
  });
}
