/**
 * GeraldOS — Next.js Proxy (Edge Authentication Gate)
 *
 * Next.js 16 uses the "proxy" file convention (replacing the older "middleware"
 * convention). Every request passes through here before reaching a page or API
 * route.
 *
 * Policy (fail closed):
 *  - Keycloak configured: the session cookie is verified on every non-public
 *    request; invalid sessions get 401 (API) or a login redirect (pages).
 *  - Keycloak NOT configured: production refuses all non-public traffic with
 *    IDENTITY_NOT_CONFIGURED. In development the bypass is available only as
 *    an explicit opt-in (DEV_AUTH=true) and every bypassed request is logged.
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
  "/api/orthanc/dicom-web",
  "/api/orthanc/wado-uri",
  "/_next",
  "/favicon.ico",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

// ─── Fail-closed responses when no identity provider is configured ───

function identityNotConfigured(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        error: {
          code: "IDENTITY_NOT_CONFIGURED",
          message: "The identity provider is not configured. Production requires Keycloak.",
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

  // Without Keycloak the platform must never serve protected traffic silently.
  if (!env.keycloakUrl) {
    // Explicit development opt-in keeps the platform demoable while identity
    // services are being provisioned; every bypass is logged.
    if (!env.isProduction && env.devAuthEnabled) {
      logger.warn("degraded auth bypass active (DEV_AUTH=true, Keycloak not configured)", {
        path: pathname,
      });
      return NextResponse.next();
    }
    return identityNotConfigured(request);
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
