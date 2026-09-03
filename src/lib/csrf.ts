/**
 * GeraldOS — CSRF Protection (strict Origin check)
 *
 * Cookie-authenticated mutations must originate from the platform itself.
 * The session cookie is already SameSite=Lax (cross-site form POSTs never
 * carry it), and this check adds defense in depth: every mutating request
 * must present an Origin — or Referer — matching the request host.
 *
 * The expected origin is derived from the forwarded proxy headers, NOT from
 * `request.nextUrl.origin`: behind Render's TLS-terminating router Next
 * resolves `nextUrl.origin` to the container's bind address
 * (`https://0.0.0.0:3000`), which no browser can ever match. See
 * src/lib/public-origin.ts for the full explanation.
 */

import type { NextRequest } from "next/server";
import type { NextResponse } from "next/server";
import { apiError, type ApiErrorBody } from "@/lib/api-error";
import { env } from "@/lib/env";
import { publicOrigin } from "@/lib/public-origin";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Is `value` an origin this deployment is allowed to accept mutations from?
 *
 * Two values qualify:
 *  1. The origin reconstructed from the request's forwarded headers — the
 *     origin the browser actually used. The browser sets `Origin` itself and
 *     an attacking page cannot make the victim's browser send a foreign
 *     `Host`, so this comparison stays strict.
 *  2. `PUBLIC_APP_URL`, the operator-declared browser-facing origin
 *     (documented in .env.example, prompted for by render.yaml). Accepting it
 *     as an additional match keeps a deployment working if a proxy strips or
 *     rewrites the forwarded headers; it can only ever widen the check to an
 *     origin the operator explicitly configured.
 */
function isAllowedOrigin(value: string, request: NextRequest): boolean {
  if (value === publicOrigin(request)) return true;

  const declared = env.publicAppUrl;
  return declared !== "" && value === declared;
}

/**
 * Return a 403 response when the request fails the Origin/Referer check,
 * or null when the request may proceed. Safe methods are never checked.
 */
export function checkCsrf(request: NextRequest): NextResponse<ApiErrorBody> | null {
  if (!MUTATING_METHODS.has(request.method.toUpperCase())) return null;

  const origin = request.headers.get("origin");
  if (origin) {
    return isAllowedOrigin(origin, request) ? null : rejected();
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return isAllowedOrigin(new URL(referer).origin, request) ? null : rejected();
    } catch {
      return rejected();
    }
  }

  // Mutating request with neither Origin nor Referer — browsers always send
  // Origin on cross-origin posts, so this is treated as suspicious.
  return rejected();
}

function rejected(): NextResponse<ApiErrorBody> {
  return apiError("CSRF_REJECTED", "Cross-origin request rejected", 403);
}
