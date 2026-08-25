import { NextRequest, NextResponse } from "next/server";
import { integrationConfig, orthancAuthHeader, timedFetch } from "@/lib/integrations";
import { withAuth } from "@/lib/middleware-helpers";
import { internalError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

/** GET /api/orthanc/patients/[id] — Patient metadata with study summary from Orthanc. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(request, "integrations.read", async () => {
    const { url } = integrationConfig.orthanc;
    if (!url) return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });

    const { id } = await params;
    try {
      const base = url.replace(/\/$/, "");
      const [patientRes, studiesRes] = await Promise.all([
        timedFetch(`${base}/patients/${id}`, { headers: { ...orthancAuthHeader() } }, 8000),
        timedFetch(`${base}/patients/${id}/studies`, { headers: { ...orthancAuthHeader() } }, 8000),
      ]);

      if (!patientRes.ok) {
        return NextResponse.json({ ok: false, reason: `upstream_http_${patientRes.status}` }, { status: patientRes.status });
      }

      const patient = (await patientRes.json()) as {
        ID: string;
        MainDicomTags?: {
          PatientName?: string;
          PatientID?: string;
          PatientBirthDate?: string;
          PatientSex?: string;
          PatientAge?: string;
        };
        Studies?: string[];
        IsStable?: boolean;
        LastUpdate?: string;
      };

      const studies = studiesRes.ok ? await studiesRes.json().catch(() => []) : [];
      const studyCount = Array.isArray(studies) ? studies.length : 0;

      return NextResponse.json({
        ok: true,
        patient: {
          orthancId: patient.ID,
          name: patient.MainDicomTags?.PatientName ?? "Unknown",
          patientId: patient.MainDicomTags?.PatientID ?? null,
          birthDate: patient.MainDicomTags?.PatientBirthDate ?? null,
          sex: patient.MainDicomTags?.PatientSex ?? null,
          age: patient.MainDicomTags?.PatientAge ?? null,
          studyCount,
          isStable: patient.IsStable ?? false,
          lastUpdate: patient.LastUpdate ?? null,
        },
      });
    } catch (error) {
      return internalError(error);
    }
  });
}
