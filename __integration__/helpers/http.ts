/**
 * Integration helpers — cookie jar + native GeraldOS login.
 *
 * The flow simulated here is exactly what a browser does:
 *   POST /api/auth/login { email, password } → staff (scrypt verify)
 *   → Set-Cookie: geraldos_session (HS256).
 */

import { env, USERS, STAFF_PASSWORD_HASH, dockerExec } from "./env";

export interface CookieJar {
  get(name: string): string | undefined;
  header(): string;
  setFromResponse(res: Response): void;
}

export function createCookieJar(): CookieJar {
  const store = new Map<string, string>();
  return {
    get: (name) => store.get(name),
    header: () => [...store.entries()].map(([k, v]) => `${k}=${v}`).join("; "),
    setFromResponse(res: Response) {
      const cookies = res.headers.getSetCookie?.() ?? [];
      for (const raw of cookies) {
        const [pair] = raw.split(";");
        const eq = pair.indexOf("=");
        const name = pair.slice(0, eq).trim();
        const value = pair.slice(eq + 1).trim();
        if (value === "" || /expires=Thu, 01 Jan 1970/i.test(raw)) store.delete(name);
        else store.set(name, value);
      }
    },
  };
}

/** fetch that sends and captures cookies like a browser. */
export async function jarFetch(jar: CookieJar, url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const existing = jar.header();
  if (existing) headers.set("cookie", existing);
  // Browsers ALWAYS attach Origin to same-origin mutations; Node's fetch does
  // not, and the platform's CSRF defence rightly requires it.
  const method = (init.method ?? "GET").toUpperCase();
  const mutates = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  if (mutates && !headers.has("origin")) {
    headers.set("origin", new URL(env.appUrl).origin);
  }
  const res = await fetch(url, { ...init, headers, redirect: "manual" });
  jar.setFromResponse(res);
  return res;
}

/**
 * Provision the native-auth staff rows into the IT PostgreSQL. Uses the same
 * scrypt hash for every user; run once per suite (idempotent: deletes any
 * prior IT staff rows for these emails, then inserts fresh).
 */
export async function provisionStaff(): Promise<void> {
  const emails = Object.values(USERS)
    .map((u) => `'${u.email}'`)
    .join(", ");
  await dockerExec(env.postgresContainer, [
    "psql", "-U", "geraldos_admin", "-d", "geraldos", "-c",
    `DELETE FROM staff WHERE email IN (${emails});`,
  ]);

  const values = Object.values(USERS)
    .map(
      (u) =>
        `('${u.email}', '${u.role}', '${u.firstName}', '${u.lastName}', '${STAFF_PASSWORD_HASH}', 'active')`,
    )
    .join(",\n");
  const sql = `
    INSERT INTO staff (email, role, first_name, last_name, password_hash, status)
    VALUES ${values};
  `;
  await dockerExec(env.postgresContainer, ["psql", "-U", "geraldos_admin", "-d", "geraldos", "-c", sql]);
}

/**
 * Native GeraldOS login: POST /api/auth/login with staff credentials and
 * return the authenticated cookie jar (geraldos_session set).
 *
 * The login endpoint is rate limited (deliberately); retries with backoff
 * honour Retry-After so parallel suites behave like well-behaved browser
 * traffic rather than tripping the guard permanently.
 */
export async function nativeLogin(email: string, password: string): Promise<CookieJar> {
  let lastError: Error = new Error("login not attempted");
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await loginOnce(email, password);
    } catch (error) {
      lastError = error as Error;
      if (!lastError.message.includes("429")) throw lastError;
      const waitSec = Number(lastError.message.match(/retry-after=(\d+)/)?.[1] ?? 0);
      const backoff = Math.max(waitSec, [5, 15, 30, 45][attempt] ?? 60);
      await new Promise((r) => setTimeout(r, backoff * 1000));
    }
  }
  throw lastError;
}

async function loginOnce(email: string, password: string): Promise<CookieJar> {
  const jar = createCookieJar();

  const res = await jarFetch(jar, `${env.appUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (res.status === 429) {
    throw new Error(`429 from /api/auth/login, retry-after=${res.headers.get("retry-after") ?? 0}`);
  }
  if (res.status !== 200) {
    throw new Error(`native login for ${email} returned ${res.status}: ${await res.text()}`);
  }
  if (!jar.get("geraldos_session")) {
    throw new Error(`login for ${email} did not produce a geraldos_session cookie`);
  }
  return jar;
}
