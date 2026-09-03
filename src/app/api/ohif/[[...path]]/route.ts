import { NextRequest } from "next/server";
import { OHIF_MOUNT_PREFIX, integrationConfig } from "@/lib/integrations";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * /api/ohif/[[...path]] — same-origin reverse proxy for the OHIF viewer.
 *
 * `next.config.ts` rewrites the public viewer namespace onto this route:
 *
 *   /viewer            -> /api/ohif/            -> OHIF /            (SPA shell)
 *   /viewer/<path>     -> /api/ohif/<path>      -> OHIF /<path>      (SPA routes)
 *   /assets/<path>     -> /api/ohif/assets/…    -> OHIF /assets/…    (JS/CSS/wasm)
 *   /app-config.js     -> /api/ohif/app-config… -> OHIF /app-config… (our config)
 *
 * The mount prefix maps 1:1 onto OHIF's own document root, which is what makes
 * the "simple" sub-path setup (`routerBasename: '/viewer'` in
 * `ohif-config/app-config.js`) work without rebuilding the OHIF image: OHIF's
 * bundle keeps emitting root-absolute asset URLs and GeraldOS owns that root
 * namespace for it.
 *
 * Auth: the viewer UI is gated on a GeraldOS session (verified here as well as
 * by the edge proxy in `src/proxy.ts`). The session cookie is deliberately NOT
 * forwarded upstream — OHIF needs no identity of its own, and clinical data is
 * authorised separately at `/api/orthanc/dicom-web`.
 */

/** Response headers worth relaying back to the browser. */
const PASSTHROUGH_RESPONSE_HEADERS = [
  "content-type",
  "cache-control",
  "etag",
  "last-modified",
  "accept-ranges",
  "content-range",
  "expires",
] as const;

/** Request headers worth sending upstream (conditional caching only). */
const PASSTHROUGH_REQUEST_HEADERS = ["accept", "if-none-match", "if-modified-since"] as const;

function jsonError(code: string, message: string, status: number): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function requireSession(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  return (await verifySessionToken(token)) !== null;
}

/** Re-root an upstream redirect onto the viewer's public mount prefix. */
function toMountedPath(pathAndQuery: string): string {
  const [path, query = ""] = pathAndQuery.split("?");
  const rooted = path.startsWith("/") ? path : `/${path}`;
  const prefixed =
    rooted === OHIF_MOUNT_PREFIX || rooted.startsWith(`${OHIF_MOUNT_PREFIX}/`)
      ? rooted
      : `${OHIF_MOUNT_PREFIX}${rooted}`;
  return query ? `${prefixed}?${query}` : prefixed;
}

function rewriteLocation(raw: string | null, ohifOrigin: string): string | null {
  if (!raw) return null;
  if (raw.startsWith("/")) return toMountedPath(raw);
  try {
    const target = new URL(raw);
    // Only remap redirects that point back at the OHIF service itself; leave
    // anything else (external links) exactly as upstream produced it.
    if (target.origin === new URL(ohifOrigin).origin) {
      return toMountedPath(`${target.pathname}${target.search}`);
    }
    return raw;
  } catch {
    return null;
  }
}

async function proxy(request: NextRequest, segments: string[]): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return jsonError("METHOD_NOT_ALLOWED", "The viewer proxy only serves GET/HEAD", 405);
  }

  if (!(await requireSession(request))) {
    return jsonError("UNAUTHORIZED", "Authentication required", 401);
  }

  const { url } = integrationConfig.ohif;
  if (!url) {
    return jsonError("NOT_CONFIGURED", "The viewer is not configured (OHIF_URL)", 503);
  }

  // Reject traversal attempts before anything reaches the upstream service.
  // `.includes("..")` rather than `=== ".."` on purpose: Next hands over
  // percent-DECODED segments, so `/api/ohif/..%2f..%2fetc` arrives as the
  // single segment "../../etc". Re-encoding below would neutralise it, but the
  // request is refused outright — the same rule the DICOMweb proxy applies.
  if (segments.some((s) => s === "" || s.includes("..") || s.includes("\\"))) {
    return jsonError("VALIDATION_FAILED", "Invalid viewer path", 400);
  }
  const upstreamPath = `/${segments.map((s) => encodeURIComponent(s)).join("/")}`;
  const upstream = `${url.replace(/\/$/, "")}${upstreamPath}${request.nextUrl.search}`;

  const headers: Record<string, string> = {};
  for (const name of PASSTHROUGH_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers[name] = value;
  }

  try {
    const res = await fetch(upstream, {
      method: request.method,
      headers,
      // Handle redirects here so upstream Location headers can be re-rooted
      // onto the mount prefix instead of leaking OHIF's internal namespace.
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(120_000),
    });

    const out = new Headers();
    for (const name of PASSTHROUGH_RESPONSE_HEADERS) {
      const value = res.headers.get(name);
      if (value) out.set(name, value);
    }
    // `content-encoding`/`content-length` are intentionally dropped: fetch has
    // already decoded the body, so relaying them would corrupt the response.
    const location = rewriteLocation(res.headers.get("location"), url);
    if (location) out.set("location", location);

    return new Response(request.method === "HEAD" ? null : res.body, {
      status: res.status,
      headers: out,
    });
  } catch {
    return jsonError("INTEGRATION_ERROR", "The imaging viewer is unreachable", 502);
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params;
  return proxy(request, path ?? []);
}

export async function HEAD(request: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params;
  return proxy(request, path ?? []);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params;
  return proxy(request, path ?? []);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params;
  return proxy(request, path ?? []);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params;
  return proxy(request, path ?? []);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params;
  return proxy(request, path ?? []);
}
