/**
 * GeraldOS — Next.js Proxy (Edge Authentication Gate)
 *
 * Next.js 16 uses the "proxy" file convention (replacing the older "middleware"
 * convention). Every request passes through here before reaching a page or API
 * route. When Keycloak is not configured the platform runs in degraded (bypass)
 * mode so it remains usable during integration setup.
 */

import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { env } from "@/lib/env";

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
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

// ─── Proxy handler ───

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes pass through unconditionally.
  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // When Keycloak is not configured, run in degraded mode so the platform
  // remains usable while identity services are being provisioned.
  if (!env.keycloakUrl) {
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

  // No valid session — reject API calls with 401, redirect pages to login.
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
