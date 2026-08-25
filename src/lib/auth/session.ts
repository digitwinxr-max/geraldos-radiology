import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";

export const SESSION_COOKIE = "geraldos_session";

export interface SessionUser {
  sub: string;
  name: string;
  email?: string;
  roles: string[];
  iss: string;
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env.authSecret);
}

/**
 * Centralised cookie options used by every auth route.
 * `secure` is enabled in production so session cookies only travel over HTTPS.
 */
export function secureCookieOptions(maxAgeSec = 60 * 60 * 8) {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSec,
    secure: env.isProduction,
  };
}

export async function createSessionToken(user: SessionUser, maxAgeSec = 60 * 60 * 8): Promise<string> {
  return new SignJWT({
    name: user.name,
    email: user.email ?? null,
    roles: user.roles,
    iss: user.iss,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.sub)
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSec}s`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return {
      sub: payload.sub ?? "",
      name: (payload.name as string) ?? "Unknown User",
      email: (payload.email as string) ?? undefined,
      roles: (payload.roles as string[]) ?? [],
      iss: (payload.iss as string) ?? "geraldos",
    };
  } catch {
    return null;
  }
}
