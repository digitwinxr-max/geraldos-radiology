import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE, secureCookieOptions } from "@/lib/auth/session";
import { authenticateStaff } from "@/lib/auth/native-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { rateLimited } from "@/lib/api-error";
import { recordAudit } from "@/lib/audit";
import { publicOrigin } from "@/lib/public-origin";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/login — native staff login.
 *
 * Accepts { email, password }, verifies against the PostgreSQL staff table
 * (scrypt), and issues the standard HS256 session cookie. Rate-limited per
 * client IP so credential guessing is throttled.
 */
export async function POST(request: NextRequest) {
  const rl = await checkRateLimit("auth:login", request, { limit: 10, windowSec: 60 });
  if (!rl.allowed) return rateLimited(rl.retryAfterSec);

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email : "";
  const password = typeof body?.password === "string" ? body.password : "";

  const result = await authenticateStaff(email, password);
  if (!result.ok) {
    return NextResponse.json(
      { error: { code: "INVALID_CREDENTIALS", message: result.error } },
      { status: 401 },
    );
  }

  const token = await createSessionToken(result.user);
  await recordAudit({
    userId: result.user.sub,
    action: "auth.login",
    module: "auth",
    details: { via: "native", email: email.toLowerCase() },
  });

  const res = NextResponse.json({ ok: true, user: result.user });
  res.cookies.set(SESSION_COOKIE, token, secureCookieOptions());
  return res;
}

/** GET is kept as a convenience redirect for stale links to the old flow. */
export async function GET(request: NextRequest) {
  // `nextUrl.origin` is the container's bind address behind Render's router
  // (https://0.0.0.0:3000), which the browser cannot navigate to. See
  // src/lib/public-origin.ts.
  return NextResponse.redirect(new URL("/login", publicOrigin(request)));
}
