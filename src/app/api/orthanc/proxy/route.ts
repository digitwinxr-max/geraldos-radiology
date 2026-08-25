import { NextRequest, NextResponse } from "next/server";
import { integrationConfig, orthancAuthHeader, timedFetch } from "@/lib/integrations";
import { withAuth } from "@/lib/middleware-helpers";
import { apiError, internalError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

/** GET /api/orthanc/proxy?p=studies/<id>/instances — sanitized pass-through to Orthanc REST */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return withAuth(request, "integrations.read", async () => {
    const { url } = integrationConfig.orthanc;
    if (!url) {
      return NextResponse.json({ error: { code: "NOT_CONFIGURED", message: "Orthanc is not configured (ORTHANC_URL)" } }, { status: 503 });
    }
    const p = request.nextUrl.searchParams.get("p") ?? "";
    if (!p || p.startsWith("/") || p.includes("//") || p.includes("?")) {
      return apiError("VALIDATION_FAILED", "Invalid proxy path", 400);
    }
    const segments = p.split("/").map(encodeURIComponent).join("/");
    const upstream = `${url.replace(/\/$/, "")}/${segments}`;

    try {
      const res = await timedFetch(upstream, { headers: { ...orthancAuthHeader() } }, 15000);
      const contentType = res.headers.get("content-type") ?? "application/json";
      const buffer = await res.arrayBuffer();
      return new NextResponse(buffer, {
        status: res.status,
        headers: { "content-type": contentType },
      });
    } catch (error) {
      return internalError(error);
    }
  });
}
