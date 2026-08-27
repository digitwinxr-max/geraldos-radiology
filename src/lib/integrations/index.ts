/**
 * GeraldOS Integration Layer
 * Central configuration and client factories for the approved stack:
 * Keycloak, Orthanc, OHIF, Dicoogle, HAPI FHIR, n8n, LangGraph, MinIO, Redis.
 *
 * Secrets audit: alongside `src/lib/env.ts`, this module is the only
 * sanctioned reader of `process.env` — integration config is resolved once
 * at module load and consumed everywhere else via `integrationConfig`.
 */

// ─── Central configuration (server-side only; secrets never reach the browser) ───
export const integrationConfig = {
  keycloak: {
    url: process.env.KEYCLOAK_URL ?? "",
    /**
     * Browser-facing base URL for front-channel redirects (login). Required
     * only when Keycloak is reached under a different host from the browser
     * than from the server (e.g. http://keycloak:8080 inside compose but
     * http://localhost:8180 in the user's browser).
     */
    publicUrl: process.env.KEYCLOAK_PUBLIC_URL ?? "",
    realm: process.env.KEYCLOAK_REALM ?? "geraldos",
    clientId: process.env.KEYCLOAK_CLIENT_ID ?? "geraldos-frontend",
    clientSecret: process.env.KEYCLOAK_CLIENT_SECRET ?? "",
    get issuer() {
      return this.url ? `${this.url.replace(/\/$/, "")}/realms/${this.realm}` : "";
    },
    /** Issuer as the browser sees it — used for the authorization redirect. */
    get publicIssuer() {
      const base = this.publicUrl || this.url;
      return base ? `${base.replace(/\/$/, "")}/realms/${this.realm}` : "";
    },
  },
  orthanc: {
    url: process.env.ORTHANC_URL ?? "",
    username: process.env.ORTHANC_USERNAME ?? "",
    password: process.env.ORTHANC_PASSWORD ?? "",
  },
  ohif: {
    url: process.env.OHIF_URL ?? "",
    /** Browser-facing base for the embedded viewer iframe (see .env.example). */
    publicUrl: process.env.OHIF_PUBLIC_URL ?? "",
    get browserUrl() {
      return this.publicUrl || this.url;
    },
  },
  dicoogle: {
    url: process.env.DICOOGLE_URL ?? "",
  },
  fhir: {
    url: process.env.FHIR_URL ?? "",
  },
  n8n: {
    url: process.env.N8N_URL ?? "",
    apiKey: process.env.N8N_API_KEY ?? "",
    webhookBase: process.env.N8N_WEBHOOK_BASE ?? "",
    webhookSecret: process.env.N8N_WEBHOOK_SECRET ?? "",
  },
  langgraph: {
    url: process.env.LANGGRAPH_URL ?? "",
    apiKey: process.env.LANGGRAPH_API_KEY ?? "",
    assistantId: process.env.LANGGRAPH_ASSISTANT_ID ?? "geraldos-agent",
  },
  minio: {
    endpoint: process.env.MINIO_ENDPOINT ?? "",
    accessKey: process.env.MINIO_ACCESS_KEY ?? "",
    secretKey: process.env.MINIO_SECRET_KEY ?? "",
    bucket: process.env.MINIO_BUCKET ?? "geraldos",
    region: process.env.MINIO_REGION ?? "us-east-1",
  },
  redis: {
    url: process.env.REDIS_URL ?? "",
  },
} as const;

/** Non-secret config that is safe to expose to the browser. */
export function publicClientConfig() {
  const kcConfigured = Boolean(integrationConfig.keycloak.url);
  return {
    keycloakEnabled: kcConfigured,
    keycloakRealm: integrationConfig.keycloak.realm,
    ohifUrl: integrationConfig.ohif.browserUrl,
    orthancUrl: integrationConfig.orthanc.url || null,
    orthancProxyBase: "/api/orthanc/proxy",
    langgraphEnabled: Boolean(integrationConfig.langgraph.url),
    n8nEnabled: Boolean(integrationConfig.n8n.url),
    minioEnabled: Boolean(integrationConfig.minio.endpoint),
    fhirEnabled: Boolean(integrationConfig.fhir.url),
    dicoogleEnabled: Boolean(integrationConfig.dicoogle.url),
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

  // Keycloak — hit OIDC discovery endpoint
  if (cfg.keycloak.url) {
    checks.push(
      measure("keycloak", "Keycloak", "Identity, RBAC & SSO", async () => {
        const discoveryUrl = `${cfg.keycloak.issuer}/.well-known/openid-configuration`;
        const res = await timedFetch(discoveryUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const realm = json.issuer?.split("/realms/")[1] ?? cfg.keycloak.realm;
        return `realm: ${realm} · OIDC ready`;
      })
    );
  } else checks.push(Promise.resolve(notConfigured("keycloak", "Keycloak", "Identity, RBAC & SSO")));

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

  // Dicoogle
  if (cfg.dicoogle.url) {
    checks.push(
      measure("dicoogle", "Dicoogle", "Search & indexing", async () => {
        const res = await timedFetch(
          `${cfg.dicoogle.url}/search?query=${encodeURIComponent("*")}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const count = json.numResults ?? (Array.isArray(json.results) ? json.results.length : "?");
        return `${count} studies indexed`;
      })
    );
  } else checks.push(Promise.resolve(notConfigured("dicoogle", "Dicoogle", "Search & indexing")));

  // HAPI FHIR
  if (cfg.fhir.url) {
    checks.push(
      measure("fhir", "HAPI FHIR", "Clinical interoperability", async () => {
        const res = await timedFetch(`${cfg.fhir.url}/metadata`, {
          headers: { Accept: "application/fhir+json" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        return `FHIR ${json.fhirVersion ?? "R4"}`;
      })
    );
  } else checks.push(Promise.resolve(notConfigured("fhir", "HAPI FHIR", "Clinical interoperability")));

  // n8n
  if (cfg.n8n.url) {
    checks.push(
      measure("n8n", "n8n", "Workflow automation", async () => {
        const res = await timedFetch(`${cfg.n8n.url}/healthz`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        return `v${json.version ?? "??"} · ${json.status ?? "ok"}`;
      })
    );
  } else checks.push(Promise.resolve(notConfigured("n8n", "n8n", "Workflow automation")));

  // LangGraph
  if (cfg.langgraph.url) {
    checks.push(
      measure("langgraph", "LangGraph", "AI agent orchestration", async () => {
        const headers: Record<string, string> = { Accept: "application/json" };
        if (cfg.langgraph.apiKey) headers["X-Api-Key"] = cfg.langgraph.apiKey;
        const res = await timedFetch(`${cfg.langgraph.url}/ok`, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json().catch(() => ({}));
        return `runtime ${json.ok === true ? "ready" : "responding"}`;
      })
    );
  } else checks.push(Promise.resolve(notConfigured("langgraph", "LangGraph", "AI agent orchestration")));

  // MinIO
  if (cfg.minio.endpoint) {
    checks.push(
      measure("minio", "MinIO", "Object storage", async () => {
        const res = await timedFetch(`${cfg.minio.endpoint}/minio/health/live`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return "storage online";
      })
    );
  } else checks.push(Promise.resolve(notConfigured("minio", "MinIO", "Object storage")));

  // Redis
  if (cfg.redis.url) {
    checks.push(
      measure("redis", "Redis", "Cache & queues", async () => {
        const { default: Redis } = await import("ioredis");
        const client = new Redis(cfg.redis.url, {
          connectTimeout: 3000,
          lazyConnect: true,
          maxRetriesPerRequest: 0,
          retryStrategy: () => null,
        });
        try {
          await client.connect();
          const pong = await client.ping();
          return `PING → ${pong}`;
        } finally {
          client.disconnect();
        }
      })
    );
  } else checks.push(Promise.resolve(notConfigured("redis", "Redis", "Cache & queues")));

  return Promise.all(checks);
}
