import { NextRequest, NextResponse } from "next/server";
import { integrationConfig, timedFetch } from "@/lib/integrations";
import { withAuth } from "@/lib/middleware-helpers";
import { internalError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withAuth(request, "integrations.read", async () => {
    const { url } = integrationConfig.dicoogle;
    if (!url) {
      return NextResponse.json({ ok: false, reason: "not_configured", results: [] });
    }
    const query = request.nextUrl.searchParams.get("q") ?? "*";
    try {
      const res = await timedFetch(
        `${url.replace(/\/$/, "")}/search?query=${encodeURIComponent(query)}`,
        {},
        10000
      );
      if (!res.ok) {
        return NextResponse.json({ ok: false, reason: `upstream_http_${res.status}`, results: [] });
      }
      const json = (await res.json()) as { results?: unknown[] };
      return NextResponse.json({ ok: true, results: json.results ?? [], query });
    } catch (error) {
      return internalError(error);
    }
  });
}
