import { NextRequest, NextResponse } from "next/server";
import { discoverOidc, buildAuthorizationUrl, keycloakConfigured } from "@/lib/auth/oidc";
import { v4 as uuid } from "uuid";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!keycloakConfigured()) {
    return NextResponse.redirect(new URL("/login?error=keycloak_not_configured", request.nextUrl.origin));
  }
  try {
    const oidc = await discoverOidc();
    const state = uuid();
    const redirectUri = `${request.nextUrl.origin}/api/auth/callback`;
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
      new URL(`/login?error=${encodeURIComponent(message)}`, request.nextUrl.origin)
    );
  }
}
