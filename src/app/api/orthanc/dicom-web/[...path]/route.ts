import { NextRequest } from "next/server";
import { integrationConfig, orthancAuthHeader } from "@/lib/integrations";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * /api/orthanc/dicom-web/[...path] — same-origin DICOMweb pass-through.
 *
 * OHIF points its qido/wado/stow roots at this route, so the browser talks to
 * the Next.js origin only (no CORS needed) and Orthanc credentials never leave
 * the server. Supports QIDO-RS (GET studies/series/instances), WADO-RS (GET
 * instances/frames, multipart/related) and STOW-RS (POST/upload).
 *
 * Exempt from withAuth (raw binary/multipart responses are incompatible with
 * the structured error wrapper), but the session cookie is verified explicitly
 * here so imaging data is never served without an authenticated user.
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

async function proxy(request: NextRequest, segments: string[]): Promise<Response> {
  // DICOM pixels/CLINICAL data must never be served without an authenticated
  // user. The OHIF viewer is served from the SAME origin (see docs/DEPLOYMENT.md
  // §7.2) so it carries the session cookie on DICOMweb calls.
  if (!(await requireSession(request))) {
    return unauthorized();
  }

  const { url } = integrationConfig.orthanc;
  if (!url) {
    return new Response(JSON.stringify({ error: { code: "NOT_CONFIGURED", message: "Orthanc is not configured (ORTHANC_URL)" } }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }

  // Sanitise: reject traversal / path escapes; forward only DICOMweb segments.
  const safe = segments
    .map((s) => encodeURIComponent(s.replace(/^\/|\/$/g, "")))
    .filter(Boolean)
    .join("/");
  if (segments.some((s) => s.includes("..") || s.includes("\\"))) {
    return new Response(JSON.stringify({ error: { code: "VALIDATION_FAILED", message: "Invalid proxy path" } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const upstream = `${url.replace(/\/$/, "")}/dicom-web/${safe}${request.nextUrl.search}`;

  const headers: Record<string, string> = { ...(orthancAuthHeader() as Record<string, string>) };
  const accept = request.headers.get("accept");
  const contentType = request.headers.get("content-type");
  if (accept) headers.accept = accept;
  if (contentType) headers["content-type"] = contentType;

  let body: BodyInit | null = null;
  if (request.method !== "GET" && request.method !== "HEAD") {
    body = await request.arrayBuffer();
  }

  try {
    const res = await fetch(upstream, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
    const buffer = await res.arrayBuffer();
    return new Response(buffer, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") ?? "application/json",
      },
    });
  } catch {
    return new Response(
      JSON.stringify({ error: { code: "INTEGRATION_ERROR", message: "Orthanc unreachable" } }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxy(request, path ?? []);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxy(request, path ?? []);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxy(request, path ?? []);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxy(request, path ?? []);
}
