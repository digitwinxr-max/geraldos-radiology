/**
 * GeraldOS — Route Handler Helpers
 *
 * Thin wrappers that combine authentication, RBAC and common patterns
 * so individual route handlers stay concise and consistent.
 */

import type { NextRequest } from "next/server";
import type { NextResponse } from "next/server";
import type { SessionUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/rbac";

/**
 * Authenticate the request, check the required permission, and invoke the
 * handler with the verified user. Returns a 401/403 on failure.
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
  const auth = await requirePermission(request, permission);
  if (!auth.ok) return auth.response;
  return handler(auth.user);
}
