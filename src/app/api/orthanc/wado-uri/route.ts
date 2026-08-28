import { NextRequest } from "next/server";
import { integrationConfig, orthancAuthHeader } from "@/lib/integrations";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * /api/orthanc/wado-uri — WADO-URI proxy.
 *
 * OHIF uses WADO-URI for image/thumbnail rendering. This route forwards
 * the WADO-URI query to Orthanc's native /wado endpoint, adding auth.
 *
 * This route serves DICOM pixels, so the session cookie is verified explicitly
 * before any Orthanc traffic. A missing or invalid session gets a 401 and the
 * request never reaches Orthanc.
 */
function unauthorized(): Response {
  return new Response(
    JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }),
    { status: 401, headers: { "content-type": "application/json" } },
  );
}

async function requireSession(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  return (await verifySessionToken(token)) !== null;
}

export async function GET(request: NextRequest) {
  if (!(await requireSession(request))) {
    return unauthorized();
  }

  const { url } = integrationConfig.orthanc;
  if (!url) {
    return new Response(
      JSON.stringify({ error: { code: "NOT_CONFIGURED", message: "Orthanc not configured" } }),
      { status: 503, headers: { "content-type": "application/json" } },
    );
  }

  const upstream = `${url.replace(/\/$/, "")}/wado${request.nextUrl.search}`;
  const headers: Record<string, string> = {
    ...(orthancAuthHeader() as Record<string, string>),
  };

  try {
    const res = await fetch(upstream, {
      method: "GET",
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
    const buffer = await res.arrayBuffer();
    return new Response(buffer, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") ?? "application/octet-stream",
        "content-length": String(buffer.byteLength),
      },
    });
  } catch {
    return new Response(
      JSON.stringify({ error: { code: "INTEGRATION_ERROR", message: "Orthanc unreachable" } }),
      { status: 502, headers: { "content-type": "application/json" } },
    );
  }
}
