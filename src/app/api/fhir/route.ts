import { NextRequest, NextResponse } from "next/server";
import { integrationConfig, timedFetch } from "@/lib/integrations";

export const dynamic = "force-dynamic";

/**
 * GET /api/fhir?resource=Patient&_count=20 — proxy to HAPI FHIR.
 * Query params (except `resource`) are forwarded untouched.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { url } = integrationConfig.fhir;
  if (!url) {
    return NextResponse.json({ error: "HAPI FHIR is not configured (FHIR_URL)" }, { status: 503 });
  }

  const params = new URLSearchParams(request.nextUrl.searchParams);
  const resource = params.get("resource") ?? "metadata";
  params.delete("resource");
  if (resource.startsWith("/") || resource.includes("//")) {
    return NextResponse.json({ error: "invalid resource path" }, { status: 400 });
  }
  const query = params.toString();
  const upstream = `${url.replace(/\/$/, "")}/${resource}${query ? `?${query}` : ""}`;

  try {
    const res = await timedFetch(upstream, { headers: { Accept: "application/fhir+json" } }, 12000);
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/fhir+json" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "HAPI FHIR unreachable", detail: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}
