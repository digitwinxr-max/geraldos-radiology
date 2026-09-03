/**
 * GeraldOS — Browser-facing request origin
 *
 * Next.js builds `request.nextUrl` from the address the server BOUND to, not
 * from the incoming `Host` header, unless `experimental.trustHostHeader` is
 * enabled. It is not enabled here — and that flag hardcodes `https://`, which
 * would break every local http environment (docker compose, `next dev`).
 *
 * See node_modules/next/dist/server/lib/router-utils/resolve-routes.js:
 *
 *   initUrl = trustHostHeader
 *     ? `https://${req.headers.host}${req.url}`
 *     : `${protocol}://${formatHostname(opts.hostname)}:${opts.port}${req.url}`
 *
 * and the standalone production server (.next/standalone/server.js):
 *
 *   const currentPort = parseInt(process.env.PORT, 10) || 3000
 *   const hostname    = process.env.HOSTNAME || "0.0.0.0"
 *
 * On Render the container MUST bind 0.0.0.0 and TLS is terminated by the
 * platform router, so `nextUrl.origin` resolves to `https://0.0.0.0:3000`.
 * No browser ever sends that as its `Origin`, so anything comparing against
 * `nextUrl.origin` (CSRF) or redirecting with it (auth routes) breaks in
 * production while still passing locally and in unit tests.
 *
 * This helper reconstructs the origin the BROWSER actually used, from the
 * headers the reverse proxy forwards. When no host header is present (unit
 * tests build a NextRequest from a URL string; local dev is served directly)
 * it falls back to `nextUrl.origin`, which is already correct there — so the
 * behaviour of every existing environment is unchanged.
 */

import type { NextRequest } from "next/server";

/** Reverse proxies send comma-separated lists; the client-facing hop is first. */
function firstHop(header: string | null): string {
  return (header ?? "").split(",")[0].trim();
}

/**
 * The public origin (`scheme://host[:port]`) the browser used to reach this
 * request. Safe to use for CSRF comparison and for absolute redirects.
 */
export function publicOrigin(request: NextRequest): string {
  const host =
    firstHop(request.headers.get("x-forwarded-host")) ||
    firstHop(request.headers.get("host"));

  // No usable host header — fall back to what Next already resolved.
  if (!host) return request.nextUrl.origin;

  // `nextUrl.protocol` already accounts for x-forwarded-proto / TLS, so it is
  // the correct fallback when the proxy did not forward the scheme.
  const protocol =
    firstHop(request.headers.get("x-forwarded-proto")) ||
    request.nextUrl.protocol.replace(/:$/, "");

  // Browsers omit the default port in an Origin header, so we must too.
  const hasDefaultPort =
    (protocol === "https" && host.endsWith(":443")) ||
    (protocol === "http" && host.endsWith(":80"));
  const normalizedHost = hasDefaultPort ? host.slice(0, host.lastIndexOf(":")) : host;

  return `${protocol}://${normalizedHost}`;
}
