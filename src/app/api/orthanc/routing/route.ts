import { NextRequest, NextResponse } from "next/server";
import { integrationConfig, orthancAuthHeader, timedFetch } from "@/lib/integrations";
import { recordAudit } from "@/lib/audit";
import { publishEvent } from "@/lib/events";

export const dynamic = "force-dynamic";

/**
 * POST /api/orthanc/routing
 *
 * Route a study to a target modality or peer via Orthanc's C-STORE / Peers API.
 * Request body:
 *   { studyId: string, target: string, type: "modality" | "peer" }
 */
export async function POST(request: NextRequest) {
  const { url } = integrationConfig.orthanc;
  if (!url) return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });

  const body = await request.json().catch(() => null);
  if (!body?.studyId || !body?.target) {
    return NextResponse.json({ ok: false, reason: "studyId and target required" }, { status: 400 });
  }

  const { studyId, target, type = "modality" } = body;
  const base = url.replace(/\/$/, "");
  const headers = { ...orthancAuthHeader(), "content-type": "application/json" };

  try {
    const endpoint = type === "peer"
      ? `${base}/peers/${encodeURIComponent(target)}/store`
      : `${base}/modalities/${encodeURIComponent(target)}/store`;

    const res = await timedFetch(
      endpoint,
      { method: "POST", headers, body: JSON.stringify({ studyId }) },
      30000
    );

    if (!res.ok) {
      const detail = await res.text().catch(() => "routing failed");
      return NextResponse.json({ ok: false, reason: `upstream_http_${res.status}`, detail }, { status: res.status });
    }

    const result = await res.json().catch(() => ({}));

    await recordAudit({
      action: "study.routed",
      module: "orthanc",
      entityType: "dicom",
      entityId: studyId,
      details: { target, type, result },
    });

    await publishEvent({
      type: "study.routed",
      aggregate: "orthanc",
      aggregateId: studyId,
      payload: { target, type, jobId: result.ID },
    });

    return NextResponse.json({ ok: true, jobId: result.ID, target, type });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      reason: error instanceof Error ? error.message : "unreachable",
    }, { status: 502 });
  }
}
