import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { discoverOidc, keycloakConfigured } from "@/lib/auth/oidc";
import { publicAppOrigin } from "@/lib/auth/origin";
import { integrationConfig } from "@/lib/integrations";
import { checkRateLimit } from "@/lib/rate-limit";
import { rateLimited } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rl = await checkRateLimit("auth:logout", request, { limit: 30, windowSec: 60 });
  if (!rl.allowed) return rateLimited(rl.retryAfterSec);

  const origin = publicAppOrigin(request);
  const res = NextResponse.redirect(new URL("/login?signed_out=1", origin));
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });

  if (keycloakConfigured()) {
    try {
      const oidc = await discoverOidc();
      if (oidc.end_session_endpoint) {
        const params = new URLSearchParams({
          post_logout_redirect_uri: `${origin}/login`,
          client_id: integrationConfig.keycloak.clientId,
        });
        const redirect = NextResponse.redirect(`${oidc.end_session_endpoint}?${params.toString()}`);
        redirect.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
        return redirect;
      }
    } catch {
      // fall through to local logout
    }
  }
  return res;
}
