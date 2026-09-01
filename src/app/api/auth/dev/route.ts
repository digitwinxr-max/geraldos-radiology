import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE, secureCookieOptions } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";
import { rateLimited } from "@/lib/api-error";

export const dynamic = "force-dynamic";

/**
 * Dev sign-in: issues a local administrator session for development demos.
 * Strictly opt-in (DEV_AUTH=true) and strictly non-production. Production
 * returns 403 regardless of DEV_AUTH so the bypass can never leak online.
 */
export async function GET(request: NextRequest) {
  const rl = await checkRateLimit("auth:dev", request, { limit: 5, windowSec: 60 });
  if (!rl.allowed) return rateLimited(rl.retryAfterSec);

  const allowDev = !env.isProduction && env.devAuthEnabled;
  if (!allowDev) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Dev authentication is not available in this environment" } },
      { status: 403 }
    );
  }

  const token = await createSessionToken({
    sub: "dev-admin",
    name: "Gerald Holdings Admin",
    email: "admin@gerald.co.bw",
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
