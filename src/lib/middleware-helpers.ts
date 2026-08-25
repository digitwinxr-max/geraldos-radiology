/**
 * GeraldOS — Route Handler Helpers
 *
 * Thin wrappers that combine authentication, RBAC, request tracing and common
 * patterns so individual route handlers stay concise and consistent.
 *
 * withAuth establishes the per-request context (AsyncLocalStorage), assigns a
 * request id, emits one structured access-log line with duration, records
 * metrics, and centrally captures any unhandled handler error as a logged 500.
 */

import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import type { NextResponse } from "next/server";
import type { SessionUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/rbac";
import { runWithRequestContext, type RequestContext } from "@/lib/request-context";
import { logger } from "@/lib/logger";
import { recordRequest } from "@/lib/metrics";
import { internalError } from "@/lib/api-error";

/**
 * Authenticate the request, check the required permission, and invoke the
 * handler with the verified user. Returns a 401/403 on failure. Unhandled
 * handler errors are logged with full context and returned as a safe 500.
 *
 * Usage:
 * ```ts
 * export async function POST(request: NextRequest) {
 *   return withAuth(request, "patients.write", async (user) => {
 *     // ... your logic
 *   });
 * }
 * ```
 */
export async function withAuth(
  request: NextRequest,
  permission: string,
  handler: (user: SessionUser) => Promise<NextResponse>,
): Promise<NextResponse> {
  const ctx: RequestContext = {
    requestId: randomUUID(),
    method: request.method,
    path: request.nextUrl.pathname,
    startedAtMs: Date.now(),
  };

  return runWithRequestContext(ctx, async () => {
    let response: NextResponse;
    try {
      const auth = await requirePermission(request, permission);
      if (!auth.ok) {
        response = auth.response;
      } else {
        ctx.userId = auth.user.sub;
        response = await handler(auth.user);
      }
    } catch (error) {
      // Central error capture: full context goes to the log, clients get the
      // safe envelope only.
      response = internalError(error);
    }

    const durationMs = Date.now() - ctx.startedAtMs;

    // Best effort — never let header decoration break a response.
    try {
      response.headers.set("x-request-id", ctx.requestId);
    } catch {
      /* response type does not allow header mutation */
    }

    logger.info(`${ctx.method} ${ctx.path}`, { status: response.status, durationMs });
    recordRequest(ctx.path, response.status, durationMs);

    return response;
  });
}
