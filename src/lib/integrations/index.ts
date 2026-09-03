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
export const integrationConfig = {
  orthanc: {
    url: process.env.ORTHANC_URL ?? "",
    username: process.env.ORTHANC_USERNAME ?? "",
    password: process.env.ORTHANC_PASSWORD ?? "",
  },
  ohif: {
    // Server-side only: edge-proxy mount target + integrations health check.
    // The browser reaches the viewer via the same-origin /viewer mount.
    url: process.env.OHIF_URL ?? "",
  },
} as const;

/** Browser-facing base of the same-origin OHIF mount (see scripts/edge-proxy.mjs). */
const VIEWER_BASE = "/viewer";

/** Non-secret config that is safe to expose to the browser. */
export function publicClientConfig() {
  return {
    // OHIF is mounted at /viewer on THIS origin by the app edge proxy, so the
    // embedded viewer is same-origin: the session cookie flows on every
    // DICOMweb call and no cross-origin configuration is needed.
    ohifUrl: VIEWER_BASE,
    viewerBase: VIEWER_BASE,
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

function notConfigured(key: string, name: string, purpose: string): IntegrationHealth {
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
      measure("orthanc", "Orthanc PACS", "DICOM server & DICOMweb", async () => {
        const res = await timedFetch(`${cfg.orthanc.url}/system`, {
          headers: { ...orthancAuthHeader() },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        return `version: ${json.Version ?? "unknown"}`;
      })
    );
  } else checks.push(Promise.resolve(notConfigured("orthanc", "Orthanc PACS", "DICOM server & DICOMweb")));

  // OHIF
  if (cfg.ohif.url) {
    checks.push(
      measure("ohif", "OHIF Viewer", "Web image viewer", async () => {
        const res = await timedFetch(`${cfg.ohif.url}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return "viewer responding";
      })
    );
  } else checks.push(Promise.resolve(notConfigured("ohif", "OHIF Viewer", "Web image viewer")));

  return Promise.all(checks);
}
