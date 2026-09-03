/**
 * GeraldOS — Next.js Proxy (Edge Authentication Gate)
 *
 * Next.js 16 uses the "proxy" file convention (replacing the older "middleware"
 * convention). Every request passes through here before reaching a page or API
 * route.
 *
 * Policy (fail closed):
 *  - A valid GeraldOS session cookie is required on every non-public request;
 *    invalid sessions get 401 (API) or a login redirect (pages).
 *  - In development the sign-in bypass is available only as an explicit opt-in
 *    (DEV_AUTH=true) and every bypassed request is logged.
 *  - Production without any authentication path (no DEV_AUTH) refuses all
 *    non-public traffic with 503.
 */

import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

// ─── Public routes that never require authentication ───

const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth",
  "/api/health",
  "/api/metrics",
  "/api/webhooks",
  "/api/integrations/client-config",
  "/_next",
  "/favicon.ico",
  // Static branding served from public/ and rendered by the PRE-authentication
  // /login screen. Without this the gate 307-redirects the <img> request to
  // /login, so the browser receives HTML instead of a PNG and the logo is
  // broken for every signed-out user. Anything else placed in public/ that a
  // signed-out screen references must be listed here too.
  "/gh-logo.png",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

// ─── Fail-closed responses when no authentication path is configured ───

function identityNotConfigured(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        error: {
          code: "IDENTITY_NOT_CONFIGURED",
          message: "No authentication path is configured. Set AUTH_SECRET and seed staff credentials, or enable DEV_AUTH in development.",
        },
      },
      { status: 503 },
    );
  }
  return NextResponse.redirect(
    new URL("/login?error=identity_not_configured", request.nextUrl.origin),
  );
}

// ─── Proxy handler ───

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes pass through unconditionally.
  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // Verify the session cookie using the same logic as the rest of the app.
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    const user = await verifySessionToken(token);
    if (user) {
      return NextResponse.next();
    }
  }

  // No valid session — but the dev bypass may still apply in development.
  if (env.devAuthEnabled && !env.isProduction) {
    logger.warn("degraded auth bypass active (DEV_AUTH=true)", {
      path: pathname,
    });
    return NextResponse.next();
  }

  // Without any authentication path the platform must never serve protected
  // traffic silently.
  if (!env.isProduction && !env.devAuthEnabled) {
    return identityNotConfigured(request);
  }

  // Reject API calls with 401, redirect pages to login.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
      { status: 401 },
    );
  }

  return NextResponse.redirect(new URL("/login", request.nextUrl.origin));
}

// ─── Matcher — exclude static assets and Next.js internals ───

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
