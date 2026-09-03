import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { rateLimited } from "@/lib/api-error";
import { publicOrigin } from "@/lib/public-origin";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/logout — clears the local session cookie and returns to the
 * login screen. Sessions are app-issued HS256 JWTs, so clearing the cookie is
 * the complete logout (no external identity provider session exists).
 */
export async function GET(request: NextRequest) {
  const rl = await checkRateLimit("auth:logout", request, { limit: 30, windowSec: 60 });
  if (!rl.allowed) return rateLimited(rl.retryAfterSec);

  // `nextUrl.origin` is the container's bind address behind Render's router
  // (https://0.0.0.0:3000), which the browser cannot navigate to. Redirect to
  // the origin the browser actually used. See src/lib/public-origin.ts.
  const res = NextResponse.redirect(new URL("/login?signed_out=1", publicOrigin(request)));
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
