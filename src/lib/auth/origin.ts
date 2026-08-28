import type { NextRequest } from "next/server";
import { env } from "@/lib/env";

/**
 * Resolve the browser-facing origin used to build OAuth redirect URIs and
 * post-auth redirect URLs.
 *
 * When `PUBLIC_APP_URL` is configured (production behind a TLS-terminating
 * proxy where the container may observe an internal origin), it is used
 * verbatim. Otherwise the incoming request origin is used, preserving
 * local-development behaviour.
 */
export function publicAppOrigin(request: NextRequest): string {
  return env.publicAppUrl || request.nextUrl.origin;
}