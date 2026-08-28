import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { discoverOidc, buildAuthorizationUrl, keycloakConfigured } from "@/lib/auth/oidc";
import { publicAppOrigin } from "@/lib/auth/origin";
import { checkRateLimit } from "@/lib/rate-limit";
import { rateLimited } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rl = await checkRateLimit("auth:login", request, { limit: 10, windowSec: 60 });
  if (!rl.allowed) return rateLimited(rl.retryAfterSec);

  const origin = publicAppOrigin(request);

  if (!keycloakConfigured()) {
    return NextResponse.redirect(new URL("/login?error=keycloak_not_configured", origin));
  }
  try {
    const oidc = await discoverOidc();
    const state = randomUUID();
    const redirectUri = `${origin}/api/auth/callback`;
    const url = buildAuthorizationUrl(oidc, redirectUri, state);
    const res = NextResponse.redirect(url);
    res.cookies.set("geraldos_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    return res;
  } catch (error) {
    const message = error instanceof Error ? error.message : "oidc_error";
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(message)}`, origin)
    );
  }
}
