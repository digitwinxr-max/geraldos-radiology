import { NextRequest, NextResponse } from "next/server";
import { integrationConfig, orthancAuthHeader, timedFetch } from "@/lib/integrations";
import { withAuth } from "@/lib/middleware-helpers";
import { internalError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

interface SeriesResource {
  ID: string;
  MainDicomTags?: {
    SeriesInstanceUID?: string;
    SeriesDescription?: string;
    Modality?: string;
    SeriesNumber?: string;
    BodyPartExamined?: string;
    NumberOfSeriesRelatedInstances?: string;
  };
  Instances?: string[];
}

/** GET /api/orthanc/studies/[id] — expanded study detail with its series. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(request, "integrations.read", async () => {
    const { url } = integrationConfig.orthanc;
    if (!url) return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });

    const { id } = await params;
    try {
      const studyRes = await timedFetch(
        `${url.replace(/\/$/, "")}/studies/${id}?expand`,
        { headers: { ...orthancAuthHeader() } },
        8000
      );
      if (!studyRes.ok) {
        return NextResponse.json({ ok: false, reason: `upstream_http_${studyRes.status}` }, { status: studyRes.status });
      }
      const study = (await studyRes.json()) as {
        ID: string;
        PatientMainDicomTags?: { PatientName?: string; PatientID?: string; PatientBirthDate?: string; PatientSex?: string };
        MainDicomTags?: {
          StudyInstanceUID?: string;
          StudyDescription?: string;
          StudyDate?: string;
          StudyTime?: string;
          AccessionNumber?: string;
          ModalitiesInStudy?: string;
          ReferringPhysicianName?: string;
        };
        Series?: SeriesResource[];
        IsStable?: boolean;
        LastUpdate?: string;
      };

      const series = (study.Series ?? []).map((s) => ({
        orthancId: s.ID,
        seriesInstanceUid: s.MainDicomTags?.SeriesInstanceUID ?? null,
        description: s.MainDicomTags?.SeriesDescription ?? null,
        modality: s.MainDicomTags?.Modality ?? null,
        seriesNumber: s.MainDicomTags?.SeriesNumber ?? null,
        bodyPart: s.MainDicomTags?.BodyPartExamined ?? null,
        instanceCount: Number(s.MainDicomTags?.NumberOfSeriesRelatedInstances ?? s.Instances?.length ?? 0),
        instances: s.Instances ?? [],
      }));

      return NextResponse.json({
        ok: true,
        study: {
          orthancId: study.ID,
          studyInstanceUid: study.MainDicomTags?.StudyInstanceUID ?? null,
          patientName: study.PatientMainDicomTags?.PatientName ?? "Unknown Patient",
          patientId: study.PatientMainDicomTags?.PatientID ?? null,
          patientBirthDate: study.PatientMainDicomTags?.PatientBirthDate ?? null,
          patientSex: study.PatientMainDicomTags?.PatientSex ?? null,
          description: study.MainDicomTags?.StudyDescription ?? null,
          accessionNumber: study.MainDicomTags?.AccessionNumber ?? null,
          studyDate: study.MainDicomTags?.StudyDate ?? null,
          studyTime: study.MainDicomTags?.StudyTime ?? null,
          modalities: study.MainDicomTags?.ModalitiesInStudy ?? "—",
          referringPhysician: study.MainDicomTags?.ReferringPhysicianName ?? null,
          isStable: study.IsStable ?? false,
          lastUpdate: study.LastUpdate ?? null,
          series,
        },
      });
    } catch (error) {
      return internalError(error);
    }
  });
}
