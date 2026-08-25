import { NextRequest, NextResponse } from "next/server";
import { integrationConfig, orthancAuthHeader, timedFetch } from "@/lib/integrations";
import { withAuth } from "@/lib/middleware-helpers";
import { internalError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

/** GET /api/orthanc/health — detailed Orthanc monitoring snapshot. */
export async function GET(request: NextRequest) {
  return withAuth(request, "integrations.read", async () => {
    const { url } = integrationConfig.orthanc;
    if (!url) {
      return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
    }
    const base = url.replace(/\/$/, "");
    const headers = { ...orthancAuthHeader() };

    try {
      const [systemRes, jobsRes, metricsRes, pluginsRes, modalitiesRes, peersRes] = await Promise.all([
        timedFetch(`${base}/system`, { headers }, 6000),
        timedFetch(`${base}/jobs?expand`, { headers }, 6000),
        timedFetch(`${base}/metrics`, { headers }, 6000),
        timedFetch(`${base}/plugins`, { headers }, 6000),
        timedFetch(`${base}/modalities`, { headers }, 6000),
        timedFetch(`${base}/peers`, { headers }, 6000),
      ]);

      const system = systemRes.ok ? await systemRes.json().catch(() => ({})) : null;
      const jobs = jobsRes.ok ? await jobsRes.json().catch(() => ({})) : null;
      const metrics = metricsRes.ok ? await metricsRes.json().catch(() => ({})) : null;
      const plugins = pluginsRes.ok ? await pluginsRes.json().catch(() => ({})) : null;
      const modalities = modalitiesRes.ok ? await modalitiesRes.json().catch(() => ({})) : null;
      const peers = peersRes.ok ? await peersRes.json().catch(() => ({})) : null;

      const jobStats = Array.isArray(jobs)
        ? jobs.reduce(
            (acc, j) => {
              const s = j.State ?? "unknown";
              acc[s] = (acc[s] ?? 0) + 1;
              return acc;
            },
            {} as Record<string, number>
          )
        : {};

      const m = (metrics as Record<string, unknown>) ?? {};
      const storageMb = typeof m["orthanc.storage.disk.free"] === "number"
        ? Math.round(m["orthanc.storage.disk.free"] / (1024 * 1024))
        : null;
      const countStudies = typeof m["orthanc.count.studies"] === "number" ? m["orthanc.count.studies"] : null;
      const countInstances = typeof m["orthanc.count.instances"] === "number" ? m["orthanc.count.instances"] : null;

      return NextResponse.json({
        ok: system !== null,
        version: system?.Version ?? null,
        name: system?.Name ?? null,
        storageFreeMb: storageMb,
        counts: { studies: countStudies, instances: countInstances },
        jobs: jobStats,
        plugins: Array.isArray(plugins) ? plugins : [],
        modalities: Array.isArray(modalities) ? modalities : [],
        peers: Array.isArray(peers) ? peers : [],
      });
    } catch {
      return internalError();
    }
  });
}
