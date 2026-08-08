import { NextResponse } from "next/server";
import { integrationConfig, orthancAuthHeader, timedFetch } from "@/lib/integrations";

export const dynamic = "force-dynamic";

interface OrthancStudyResource {
  ID: string;
  PatientMainDicomTags?: { PatientName?: string; PatientID?: string };
  MainDicomTags?: {
    StudyInstanceUID?: string;
    StudyDescription?: string;
    StudyDate?: string;
    AccessionNumber?: string;
    ModalitiesInStudy?: string;
  };
  Series?: string[];
  IsStable?: boolean;
}

export async function GET() {
  const { url } = integrationConfig.orthanc;
  if (!url) {
    return NextResponse.json({ ok: false, reason: "not_configured", studies: [] });
  }

  try {
    const listRes = await timedFetch(
      `${url.replace(/\/$/, "")}/studies?expand&since=0&limit=100`,
      { headers: { ...orthancAuthHeader() } },
      8000
    );
    if (!listRes.ok) {
      return NextResponse.json({ ok: false, reason: `upstream_http_${listRes.status}`, studies: [] });
    }
    const resources = (await listRes.json()) as OrthancStudyResource[];

    // Some studies (especially generated samples) lack ModalitiesInStudy at the
    // study level. Derive modalities from each study's series so the worklist
    // always shows a real modality label.
    const seriesRes = await timedFetch(
      `${url.replace(/\/$/, "")}/series?expand&since=0&limit=2000`,
      { headers: { ...orthancAuthHeader() } },
      8000
    );
    const seriesByStudy = new Map<string, Set<string>>();
    if (seriesRes.ok) {
      const seriesList = (await seriesRes.json()) as {
        ParentStudy?: string;
        MainDicomTags?: { Modality?: string };
      }[];
      for (const se of seriesList) {
        const mod = se.MainDicomTags?.Modality;
        if (!se.ParentStudy || !mod) continue;
        const set = seriesByStudy.get(se.ParentStudy) ?? new Set<string>();
        set.add(mod);
        seriesByStudy.set(se.ParentStudy, set);
      }
    }

    const studies = resources
      .map((s) => {
        const seriesModalities = [...(seriesByStudy.get(s.ID) ?? [])];
        return {
          orthancId: s.ID,
          studyInstanceUid: s.MainDicomTags?.StudyInstanceUID ?? null,
          patientName: s.PatientMainDicomTags?.PatientName ?? null,
          patientId: s.PatientMainDicomTags?.PatientID ?? null,
          description: s.MainDicomTags?.StudyDescription ?? null,
          accessionNumber: s.MainDicomTags?.AccessionNumber ?? null,
          modalities: s.MainDicomTags?.ModalitiesInStudy ?? (seriesModalities.join("/") || "—"),
          seriesCount: s.Series?.length ?? 0,
          studyDate: s.MainDicomTags?.StudyDate ?? null,
        };
      })
      // Drop studies with no patient identity — unknown patients never surface in the worklist.
      .filter((s) => Boolean(s.patientName?.trim()));
    return NextResponse.json({ ok: true, studies });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      reason: error instanceof Error ? error.message : "unreachable",
      studies: [],
    });
  }
}
