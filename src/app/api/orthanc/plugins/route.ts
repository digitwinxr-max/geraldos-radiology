import { NextRequest, NextResponse } from "next/server";
import { integrationConfig, orthancAuthHeader, timedFetch } from "@/lib/integrations";
import { withAuth } from "@/lib/middleware-helpers";
import { internalError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

/**
 * GET /api/orthanc/plugins — List installed Orthanc plugins with status.
 */
export async function GET(request: NextRequest) {
  return withAuth(request, "integrations.read", async () => {
    const { url } = integrationConfig.orthanc;
    if (!url) return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });

    const base = url.replace(/\/$/, "");

    try {
      const [pluginsRes, jobsRes] = await Promise.all([
        timedFetch(`${base}/plugins`, { headers: { ...orthancAuthHeader() } }, 8000),
        timedFetch(`${base}/jobs?expand`, { headers: { ...orthancAuthHeader() } }, 8000),
      ]);

      const plugins = pluginsRes.ok ? await pluginsRes.json().catch(() => []) : [];
      const jobs = jobsRes.ok ? await jobsRes.json().catch(() => []) : [];

      const pluginList = Array.isArray(plugins) ? plugins.map((p: string) => ({
        name: p,
      })) : [];

      // Count active jobs by plugin
      const jobsByPlugin: Record<string, number> = {};
      if (Array.isArray(jobs)) {
        for (const job of jobs) {
          const content = job.Content ?? {};
          const plugin = content.Plugin ?? "unknown";
          jobsByPlugin[plugin] = (jobsByPlugin[plugin] ?? 0) + 1;
        }
      }

      return NextResponse.json({
        ok: true,
        plugins: pluginList.map((p) => ({
          ...p,
          activeJobs: jobsByPlugin[p.name] ?? 0,
        })),
        totalPlugins: pluginList.length,
        totalJobs: Array.isArray(jobs) ? jobs.length : 0,
      });
    } catch (error) {
      return internalError(error);
    }
  });
}
