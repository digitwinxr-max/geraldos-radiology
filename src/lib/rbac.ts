/**
 * GeraldOS — Role-Based Access Control
 *
 * Maps roles to permissions and provides server-side enforcement helpers.
 * Permissions use a "domain.action" pattern with wildcard support:
 *   - "*"           matches everything (administrator)
 *   - "workflow.*"  matches "workflow.read", "workflow.write", "workflow.update"
 *   - "*.read"      matches "patients.read", "reports.read", etc.
 */

import { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken, type SessionUser } from "@/lib/auth/session";
import { unauthorized, forbidden } from "@/lib/api-error";
import { checkCsrf } from "@/lib/csrf";

// ─── Role → Permission map ───

const ROLE_PERMISSIONS: Record<string, string[]> = {
  administrator: ["*"],
  radiologist: [
    "patients.read",
    "workflow.*",
    "reports.*",
    "imaging.*",
    "ai-review.*",
    "integrations.read",
    "knowledge.read",
  ],
  radiographer: [
    "patients.read",
    "workflow.read",
    "workflow.update",
    "imaging.*",
    "integrations.read",
  ],
  receptionist: [
    "patients.*",
    "referrals.*",
    "appointments.*",
    "scheduling.*",
  ],
  manager: [
    "*.read",
    "finance.*",
    "equipment.*",
    "inventory.*",
    "reports.read",
    "administration.*",
  ],
  finance: [
    "finance.*",
    "patients.read",
  ],
  referring_doctor: [
    "patients.read",
    "referrals.*",
    "reports.read",
  ],
};

// ─── Permission matching ───

/**
 * Check whether a set of roles grants a specific permission.
 * Supports wildcard patterns in both the role map and the requested permission.
 */
export function hasPermission(roles: string[], permission: string): boolean {
  for (const role of roles) {
    const granted = ROLE_PERMISSIONS[role];
    if (!granted) continue;

    for (const pattern of granted) {
      if (pattern === "*") return true;

      // "domain.*" matches "domain.anything"
      if (pattern.endsWith(".*")) {
        const domain = pattern.slice(0, -2);
        if (permission === domain || permission.startsWith(domain + ".")) {
          return true;
        }
      }

      // "*.action" matches "anything.action"
      if (pattern.startsWith("*.")) {
        const action = pattern.slice(2);
        if (permission.endsWith("." + action)) {
          return true;
        }
      }

      // Exact match
      if (pattern === permission) return true;
    }
  }
  return false;
}

// ─── Route guard ───

type AuthResult =
  | { ok: true; user: SessionUser }
  | { ok: false; response: ReturnType<typeof unauthorized> };

/**
 * Verify the session cookie and check that the authenticated user holds the
 * required permission. Returns the user on success, or a NextResponse (401/403)
 * on failure — ready to return directly from the route handler.
 *
 * Mutating requests are first validated against the strict Origin/Referer
 * CSRF check so every withAuth mutation is same-origin by construction.
 */
export async function requirePermission(
  request: NextRequest,
  permission: string,
): Promise<AuthResult> {
  const csrf = checkCsrf(request);
  if (csrf) return { ok: false, response: csrf };

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return { ok: false, response: unauthorized() };
  }

  const user = await verifySessionToken(token);
  if (!user) {
    return { ok: false, response: unauthorized("Session expired or invalid") };
  }

  if (!hasPermission(user.roles, permission)) {
    return { ok: false, response: forbidden() };
  }

  return { ok: true, user };
}

/**
 * Return all permissions granted by a given set of roles.
 * Useful for the /api/auth/me endpoint and UI visibility logic.
 */
export function getRolePermissions(roles: string[]): string[] {
  const perms = new Set<string>();
  for (const role of roles) {
    const granted = ROLE_PERMISSIONS[role];
    if (granted) {
      for (const p of granted) perms.add(p);
    }
  }
  return [...perms];
}
