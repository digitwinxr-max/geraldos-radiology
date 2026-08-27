/**
 * Integration helpers — cookie jar + full Keycloak authorization-code flow.
 *
 * The flow simulated here is exactly what a browser does:
 *   /api/auth/login → 302 Keycloak authorize → login form POST →
 *   302 back to /api/auth/callback?code&state → session cookie.
 */

import { env } from "./env";

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
  // Browsers ALWAYS attach Origin to cross-origin-safe same-origin mutations;
  // Node's fetch does not, and the platform's CSRF defence rightly requires it.
  const method = (init.method ?? "GET").toUpperCase();
  const mutates = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  if (mutates && !headers.has("origin")) {
    headers.set("origin", new URL(env.appUrl).origin);
  }
  const res = await fetch(url, { ...init, headers, redirect: "manual" });
  jar.setFromResponse(res);
  return res;
}

interface LoginForm {
  action: string;
}

function parseLoginForm(html: string): LoginForm | null {
  const match = html.match(/<form[^>]*id="kc-form-login"[^>]*action="([^"]+)"/)
    ?? html.match(/<form[^>]*action="([^"]+)"[^>]*id="kc-form-login"/);
  if (!match) return null;
  return { action: match[1].replace(/&amp;/g, "&") };
}

/**
 * Drive the complete GeraldOS + Keycloak login for a seeded realm user.
 * Returns the authenticated cookie jar (geraldos_session set).
 *
 * The app's login/callback endpoints are rate limited (deliberately); retries
 * with backoff honour Retry-After so parallel suites behave like well-behaved
 * browser traffic rather than tripping the guard permanently.
 */
export async function keycloakLogin(username: string, password: string): Promise<CookieJar> {
  let lastError: Error = new Error("login not attempted");
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await loginOnce(username, password);
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

async function loginOnce(username: string, password: string): Promise<CookieJar> {
  const jar = createCookieJar();

  // 1. Ask GeraldOS to start the OIDC dance.
  const loginRes = await jarFetch(jar, `${env.appUrl}/api/auth/login`);
  if (loginRes.status === 429) {
    throw new Error(`429 from /api/auth/login, retry-after=${loginRes.headers.get("retry-after") ?? 0}`);
  }
  if (loginRes.status !== 302 && loginRes.status !== 307) {
    throw new Error(`expected redirect from /api/auth/login, got ${loginRes.status}`);
  }
  const authorizeUrl = loginRes.headers.get("location");
  if (!authorizeUrl?.includes("/realms/")) {
    throw new Error(`authorize redirect does not point at Keycloak: ${authorizeUrl}`);
  }

  // 2. Fetch the Keycloak login form.
  const formRes = await jarFetch(jar, authorizeUrl);
  if (formRes.status !== 200) throw new Error(`Keycloak authorize returned ${formRes.status}`);
  const form = parseLoginForm(await formRes.text());
  if (!form) throw new Error("could not locate the Keycloak login form");

  // 3. Submit credentials.
  const postRes = await jarFetch(jar, form.action, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username, password, credentialId: "" }).toString(),
  });

  // 4. Follow redirects back through /api/auth/callback until we land in the app.
  let current: Response | null = postRes;
  for (let hops = 0; hops < 10 && current && current.status >= 300 && current.status < 400; hops++) {
    const next = current.headers.get("location");
    if (!next) break;
    current = await jarFetch(jar, new URL(next, env.appUrl).toString());
    if (current.status === 429) {
      throw new Error(`429 during callback, retry-after=${current.headers.get("retry-after") ?? 0}`);
    }
    if (current.status === 200) break;
  }

  if (!jar.get("geraldos_session")) {
    throw new Error(`login for ${username} did not produce a geraldos_session cookie`);
  }
  return jar;
}
