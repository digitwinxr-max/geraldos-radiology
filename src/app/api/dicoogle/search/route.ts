import { NextRequest, NextResponse } from "next/server";
import { integrationConfig, timedFetch } from "@/lib/integrations";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
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
    return NextResponse.json({
      ok: false,
      reason: error instanceof Error ? error.message : "unreachable",
      results: [],
    });
  }
}
