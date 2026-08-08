import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { discoverOidc, keycloakConfigured } from "@/lib/auth/oidc";
import { integrationConfig } from "@/lib/integrations";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const res = NextResponse.redirect(new URL("/login?signed_out=1", origin));
  res.cookies.delete(SESSION_COOKIE);

  if (keycloakConfigured()) {
    try {
      const oidc = await discoverOidc();
      if (oidc.end_session_endpoint) {
        const params = new URLSearchParams({
          post_logout_redirect_uri: `${origin}/login`,
          client_id: integrationConfig.keycloak.clientId,
        });
        const redirect = NextResponse.redirect(`${oidc.end_session_endpoint}?${params.toString()}`);
        redirect.cookies.delete(SESSION_COOKIE);
        return redirect;
      }
    } catch {
      // fall through to local logout
    }
  }
  return res;
}
