import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { keycloakConfigured } from "@/lib/auth/oidc";

export const dynamic = "force-dynamic";

/**
 * Exempt from rate limiting: authenticated session read polled by the client
 * (use-auth-me) to render the current identity.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = token ? await verifySessionToken(token) : null;
  if (!user) {
    return NextResponse.json({ authenticated: false, keycloakEnabled: keycloakConfigured() }, { status: 401 });
  }
  return NextResponse.json({ authenticated: true, user, keycloakEnabled: keycloakConfigured() });
}
