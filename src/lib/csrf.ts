/**
 * GeraldOS — CSRF Protection (strict Origin check)
 *
 * Cookie-authenticated mutations must originate from the platform itself.
 * The session cookie is already SameSite=Lax (cross-site form POSTs never
 * carry it), and this check adds defense in depth: every mutating request
 * must present an Origin — or Referer — matching the request host.
 */

import type { NextRequest } from "next/server";
import type { NextResponse } from "next/server";
import { apiError, type ApiErrorBody } from "@/lib/api-error";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Return a 403 response when the request fails the Origin/Referer check,
 * or null when the request may proceed. Safe methods are never checked.
 */
export function checkCsrf(request: NextRequest): NextResponse<ApiErrorBody> | null {
  if (!MUTATING_METHODS.has(request.method.toUpperCase())) return null;

  const expected = request.nextUrl.origin;

  const origin = request.headers.get("origin");
  if (origin) {
    return origin === expected ? null : rejected();
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin === expected ? null : rejected();
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
