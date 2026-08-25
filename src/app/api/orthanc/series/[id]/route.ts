import { NextRequest, NextResponse } from "next/server";
import { integrationConfig, orthancAuthHeader, timedFetch } from "@/lib/integrations";
import { withAuth } from "@/lib/middleware-helpers";
import { internalError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

interface InstanceResource {
  ID: string;
  MainDicomTags?: {
    SOPInstanceUID?: string;
    InstanceNumber?: string;
    ImageType?: string;
  };
  IndexInSeries?: number;
}

/** GET /api/orthanc/series/[id] — expanded series detail with its instances. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(request, "integrations.read", async () => {
    const { url } = integrationConfig.orthanc;
    if (!url) return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });

    const { id } = await params;
    try {
      const res = await timedFetch(
        `${url.replace(/\/$/, "")}/series/${id}?expand`,
        { headers: { ...orthancAuthHeader() } },
        8000
      );
      if (!res.ok) {
        return NextResponse.json({ ok: false, reason: `upstream_http_${res.status}` }, { status: res.status });
      }
      const series = (await res.json()) as {
        ID: string;
        MainDicomTags?: {
          SeriesInstanceUID?: string;
          SeriesDescription?: string;
          Modality?: string;
          SeriesNumber?: string;
          BodyPartExamined?: string;
        };
        Instances?: InstanceResource[];
        ExpectedNumberOfInstances?: number;
        IsStable?: boolean;
      };

      const instances = (series.Instances ?? []).map((i) => ({
        orthancId: i.ID,
        sopInstanceUid: i.MainDicomTags?.SOPInstanceUID ?? null,
        instanceNumber: i.MainDicomTags?.InstanceNumber ?? null,
        indexInSeries: i.IndexInSeries ?? null,
      }));

      return NextResponse.json({
        ok: true,
        series: {
          orthancId: series.ID,
          seriesInstanceUid: series.MainDicomTags?.SeriesInstanceUID ?? null,
          description: series.MainDicomTags?.SeriesDescription ?? null,
          modality: series.MainDicomTags?.Modality ?? null,
          seriesNumber: series.MainDicomTags?.SeriesNumber ?? null,
          bodyPart: series.MainDicomTags?.BodyPartExamined ?? null,
          instanceCount: instances.length,
          expectedInstances: series.ExpectedNumberOfInstances ?? instances.length,
          isStable: series.IsStable ?? false,
          instances,
        },
      });
    } catch {
      return internalError();
    }
  });
}
