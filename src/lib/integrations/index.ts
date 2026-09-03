/**
 * GeraldOS Integration Layer
 * Central configuration and client factories for the lean production stack:
 * Orthanc + OHIF only (PostgreSQL is the platform's own database, not an
 * "integration").
 *
 * Secrets audit: alongside `src/lib/env.ts`, this module is the only
 * sanctioned reader of `process.env` — integration config is resolved once
 * at module load and consumed everywhere else via `integrationConfig`.
 */

// ─── Central configuration (server-side only; secrets never reach the browser) ───

/**
 * Normalise an internal service address into an absolute URL.
 *
 * Render injects private-network addresses from a Blueprint
 * `fromService: { property: hostport }` reference as a bare `host:port`
 * (e.g. `geraldos-orthanc-ab1c:8042`) with NO scheme, and Blueprint files do
 * not support variable interpolation, so `http://` cannot be prefixed in
 * render.yaml. `fetch()` rejects a scheme-less target with "unknown scheme",
 * which silently takes down every Orthanc call. Values that already carry a
 * scheme (docker-compose, .env.example, CI) are returned untouched.
 *
 * Internal Render traffic is plain HTTP over the private network, so `http`
 * is the correct default. Every address in this module is server-side only:
 * the browser never learns an internal hostname (see `publicClientConfig`).
 */
export function normalizeServiceUrl(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  if (!value) return "";
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `http://${value}`;
}

/**
 * Where the OHIF viewer is mounted on the GeraldOS origin.
 *
 * OHIF is reverse-proxied by Next.js at this prefix (see the rewrites in
 * `next.config.ts` and `app/api/ohif/[[...path]]/route.ts`) instead of being
 * served from its own hostname. That is load-bearing for auth, not a nicety:
 * Render's free hostnames are subdomains of `onrender.com`, which is on the
 * Public Suffix List, so `geraldos-radiology.onrender.com` and
 * `geraldos-ohif.onrender.com` are CROSS-SITE with respect to each other. A
 * separate-origin viewer could therefore never receive the session cookie
 * (`SameSite=Lax`), and every way of forcing it — `Domain=.onrender.com`
 * (rejected by RFC 6265 across a public suffix), or `SameSite=None` plus CORS
 * `credentials` on clinical-data endpoints — weakens auth or is impossible
 * once third-party cookies are blocked. Serving the viewer from the app's own
 * origin keeps the cookie same-site, needs no CORS at all, keeps DICOMweb
 * same-origin, and lets the OHIF service stay private.
 *
 * The value is a path prefix (not a URL) because it is by definition the
 * current origin; clients build `${OHIF_MOUNT_PREFIX}/viewer?StudyInstanceUIDs=…`.
 */
export const OHIF_MOUNT_PREFIX = "/viewer";

export const integrationConfig = {
  orthanc: {
    url: normalizeServiceUrl(process.env.ORTHANC_URL),
    username: process.env.ORTHANC_USERNAME ?? "",
    password: process.env.ORTHANC_PASSWORD ?? "",
  },
  ohif: {
    /**
     * Internal address of the private OHIF service. Server-side only — used by
     * the viewer proxy and by the health check. The browser is given
     * `OHIF_MOUNT_PREFIX` instead and never sees this hostname.
     */
    url: normalizeServiceUrl(process.env.OHIF_URL),
  },
} as const;

/**
 * Non-secret config that is safe to expose to the browser
 * (`GET /api/integrations/client-config`, unauthenticated by design).
 *
 * Publishes NO internal infrastructure detail: `ohifUrl` is a same-origin path
 * prefix, and Orthanc is reachable from the browser only through the
 * authenticated `/api/orthanc/proxy` and `/api/orthanc/dicom-web` routes, so
 * its private hostname is deliberately absent.
 */
export function publicClientConfig() {
  return {
    ohifUrl: OHIF_MOUNT_PREFIX,
    orthancProxyBase: "/api/orthanc/proxy",
  };
}

// ─── HTTP helper with timeout ───
export async function timedFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs = 3500
): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
}

// ─── Health checking ───
export type IntegrationStatus = "connected" | "unreachable" | "not_configured";

export interface IntegrationHealth {
  key: string;
  name: string;
  purpose: string;
  status: IntegrationStatus;
  latencyMs: number | null;
  detail?: string;
}

async function measure(
  name: string,
  purpose: string,
  key: string,
  check: () => Promise<string | undefined>
): Promise<IntegrationHealth> {
  const start = Date.now();
  try {
    const detail = await check();
    return {
      key,
      name,
      purpose,
      status: "connected",
      latencyMs: Date.now() - start,
      detail,
    };
  } catch (error) {
    return {
      key,
      name,
      purpose,
      status: "unreachable",
      latencyMs: Date.now() - start,
      detail: error instanceof Error ? error.message : "connection failed",
    };
  }
}

function notConfigured(name: string, purpose: string, key: string): IntegrationHealth {
  return { key, name, purpose, status: "not_configured", latencyMs: null };
}

export function orthancAuthHeader(): HeadersInit {
  const { username, password } = integrationConfig.orthanc;
  if (username || password) {
    const encoded = Buffer.from(`${username}:${password}`).toString("base64");
    return { Authorization: `Basic ${encoded}` };
  }
  return {};
}

export async function checkAllIntegrations(): Promise<IntegrationHealth[]> {
  const cfg = integrationConfig;
  const checks: Promise<IntegrationHealth>[] = [];

  // Orthanc
  if (cfg.orthanc.url) {
    checks.push(
      // measure(name, purpose, key, …) — `key` is the stable machine id that
      // the settings page uses for its ENDPOINT_HINTS/SERVICE_ACCENT lookups.
      measure("Orthanc PACS", "DICOM server & DICOMweb", "orthanc", async () => {
        const res = await timedFetch(`${cfg.orthanc.url}/system`, {
          headers: { ...orthancAuthHeader() },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        return `version: ${json.Version ?? "unknown"}`;
      })
    );
  } else checks.push(Promise.resolve(notConfigured("Orthanc PACS", "DICOM server & DICOMweb", "orthanc")));

  // OHIF
  if (cfg.ohif.url) {
    checks.push(
      measure("OHIF Viewer", "Web image viewer", "ohif", async () => {
        const res = await timedFetch(`${cfg.ohif.url}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return "viewer responding";
      })
    );
  } else checks.push(Promise.resolve(notConfigured("OHIF Viewer", "Web image viewer", "ohif")));

  return Promise.all(checks);
}
