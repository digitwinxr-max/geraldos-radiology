import { NextRequest } from "next/server";
import { integrationConfig, orthancAuthHeader } from "@/lib/integrations";

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
 * Exempt from withAuth — the global proxy middleware handles session validation,
 * and this route returns raw binary/multipart responses incompatible with the
 * structured error wrapper.
 */
async function proxy(request: NextRequest, segments: string[]) {
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
        "access-control-allow-origin": "*",
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

export async function OPTIONS(_request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  await params;
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
      "access-control-allow-headers": "content-type, accept, authorization",
    },
  });
}
