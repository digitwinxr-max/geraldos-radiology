import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE, secureCookieOptions } from "@/lib/auth/session";
import { keycloakConfigured } from "@/lib/auth/oidc";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Dev sign-in: issues a local administrator session when Keycloak is not
 * wired up (or when DEV_AUTH=true). Keeps the platform demoable in degraded mode.
 */
export async function GET(request: NextRequest) {
  const isDevEnvironment = process.env.NODE_ENV !== "production";
  const allowDev = isDevEnvironment && (!keycloakConfigured() || process.env.DEV_AUTH === "true");
  if (!allowDev) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Dev authentication is not available in this environment" } },
      { status: 403 }
    );
  }

  const token = await createSessionToken({
    sub: "dev-admin",
    name: "Gerald Holdings Admin",
    email: "admin@gerald.co.za",
    roles: ["administrator", "radiologist", "radiographer", "receptionist", "manager"],
    iss: "geraldos-dev",
  });

  await recordAudit({
    userId: "dev-admin",
    action: "auth.login",
    module: "auth",
    details: { name: "Gerald Holdings Admin", via: "dev" },
  });

  const res = NextResponse.redirect(new URL("/", request.nextUrl.origin));
  res.cookies.set(SESSION_COOKIE, token, secureCookieOptions());
  return res;
}
