import { NextRequest, NextResponse } from "next/server";
import { integrationConfig, orthancAuthHeader, timedFetch } from "@/lib/integrations";

export const dynamic = "force-dynamic";

/**
 * POST /api/orthanc/storage-commitment
 *
 * Triggers a DICOM Storage Commitment (N-ACTION) to verify that instances
 * have been safely stored by the PACS. Useful for regulatory compliance.
 * Request body: { studyId: string }
 */
export async function POST(request: NextRequest) {
  const { url } = integrationConfig.orthanc;
  if (!url) return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });

  const body = await request.json().catch(() => null);
  if (!body?.studyId) {
    return NextResponse.json({ ok: false, reason: "studyId required" }, { status: 400 });
  }

  const { studyId } = body;
  const base = url.replace(/\/$/, "");

  try {
    // Orthanc triggers storage commitment via modalities API
    // First, retrieve the study's instances
    const instancesRes = await timedFetch(
      `${base}/studies/${studyId}?expand`,
      { headers: { ...orthancAuthHeader() } },
      10000
    );

    if (!instancesRes.ok) {
      return NextResponse.json({ ok: false, reason: "study_not_found" }, { status: 404 });
    }

    const study = (await instancesRes.json()) as { Series?: { Instances?: string[] }[] };
    const instanceIds = (study.Series ?? []).flatMap((s) => s.Instances ?? []);

    if (instanceIds.length === 0) {
      return NextResponse.json({ ok: false, reason: "no instances in study" }, { status: 400 });
    }

    // Storage commitment request
    const commitmentRes = await timedFetch(
      `${base}/storage-commitment`,
      {
        method: "POST",
        headers: { ...orthancAuthHeader(), "content-type": "application/json" },
        body: JSON.stringify({ instances: instanceIds }),
      },
      30000
    );

    if (!commitmentRes.ok) {
      return NextResponse.json({
        ok: false,
        reason: `upstream_http_${commitmentRes.status}`,
      }, { status: commitmentRes.status });
    }

    const commitment = await commitmentRes.json().catch(() => ({}));

    return NextResponse.json({
      ok: true,
      studyId,
      instanceCount: instanceIds.length,
      commitmentJobId: commitment.ID ?? null,
      status: "pending",
      message: "Storage commitment request submitted. Check job status for completion.",
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      reason: error instanceof Error ? error.message : "unreachable",
    }, { status: 502 });
  }
}
