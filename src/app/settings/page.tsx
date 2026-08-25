"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Shell } from "@/components/layout/shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/ui/status-badge";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface IntegrationHealth {
  key: string;
  name: string;
  purpose: string;
  status: "connected" | "unreachable" | "not_configured";
  latencyMs: number | null;
  detail?: string;
}

const ENDPOINT_HINTS: Record<string, { env: string; hintPath: string }> = {
  keycloak: { env: "KEYCLOAK_URL", hintPath: "/realms/geraldos" },
  orthanc: { env: "ORTHANC_URL", hintPath: "8042 · DICOMweb + REST" },
  ohif: { env: "OHIF_URL", hintPath: "3001 · viewer app" },
  dicoogle: { env: "DICOOGLE_URL", hintPath: "8080 · /search" },
  fhir: { env: "FHIR_URL", hintPath: "8090/fhir · /metadata" },
  n8n: { env: "N8N_URL", hintPath: "5678 · /healthz" },
  langgraph: { env: "LANGGRAPH_URL", hintPath: "8123 · /ok" },
  minio: { env: "MINIO_ENDPOINT", hintPath: "9000 · /minio/health/live" },
  redis: { env: "REDIS_URL", hintPath: "6379 · PING" },
  postgres: { env: "DATABASE_URL", hintPath: "5432 · SELECT 1" },
};

// Semantic accent per service: azure = core platform, violet = AI services.
const SERVICE_ACCENT: Record<string, string> = {
  orthanc: "bg-brand-soft text-brand-text",
  ohif: "bg-brand-soft text-brand-text",
  dicoogle: "bg-brand-soft text-brand-text",
  fhir: "bg-brand-soft text-brand-text",
  postgres: "bg-brand-soft text-brand-text",
  redis: "bg-brand-soft text-brand-text",
  minio: "bg-brand-soft text-brand-text",
  keycloak: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  n8n: "bg-brand-soft text-brand-text",
  langgraph: "bg-ai-soft text-ai-text",
};

export default function SettingsPage() {
  const [integrations, setIntegrations] = useState<IntegrationHealth[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(() => {
    setLoading(true);
    fetch("/api/integrations/status")
      .then((r) => r.json())
      .then((d) => setIntegrations(d.integrations ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  return (
    <Shell title="Settings" description="Platform configuration and integrations">
      <Tabs defaultValue="integrations">
        <TabsList>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="auth">Authentication</TabsTrigger>
          <TabsTrigger value="system">System</TabsTrigger>
        </TabsList>

        <TabsContent value="integrations">
          <div className="mb-6 flex items-center justify-between">
            <p className="text-sm text-slate-500">
              Live connectivity to the approved stack. Endpoints are configured through environment variables.
            </p>
            <button
              onClick={fetchStatus}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Re-check
            </button>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {integrations.map((svc) => {
              const hint = ENDPOINT_HINTS[svc.key];
              return (
                <Card key={svc.key}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg text-lg font-bold", SERVICE_ACCENT[svc.key] ?? "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300")}>
                          {svc.name.charAt(0)}
                        </div>
                        <div>
                          <CardTitle className="text-base">{svc.name}</CardTitle>
                          <CardDescription>{svc.purpose}</CardDescription>
                        </div>
                      </div>
                      <StatusBadge status={svc.status} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Connection</span>
                      <span className="font-medium text-slate-900">
                        {svc.status === "connected"
                          ? `${svc.latencyMs}ms`
                          : svc.status === "unreachable"
                          ? "No response"
                          : "Awaiting configuration"}
                      </span>
                    </div>
                    {svc.detail && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">Detail</span>
                        <span className="max-w-[60%] truncate text-right font-medium text-slate-700">
                          {svc.detail}
                        </span>
                      </div>
                    )}
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        Environment variable
                      </label>
                      <Input value={hint?.env ?? ""} readOnly className="bg-slate-50 font-mono text-xs" />
                      {hint && <p className="mt-1 text-xs text-slate-400">{hint.hintPath}</p>}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="auth">
          <Card>
            <CardHeader>
              <CardTitle>Authentication</CardTitle>
              <CardDescription>
                Keycloak OIDC Authorization Code flow with JWT session cookies
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-slate-100 p-4">
                <p className="font-medium text-slate-900">Flow</p>
                <p className="mt-1 font-mono text-xs text-slate-500">
                  /login → /api/auth/login → Keycloak → /api/auth/callback → signed JWT session
                </p>
              </div>
              <div className="space-y-3">
                {[
                  { route: "/api/auth/login", desc: "Initiates Keycloak Authorization Code flow (OIDC discovery + state cookie)" },
                  { route: "/api/auth/callback", desc: "Exchanges code, verifies id_token via JWKS, issues HS256 session" },
                  { route: "/api/auth/me", desc: "Returns the current signed-in identity and roles" },
                  { route: "/api/auth/logout", desc: "Clears the session and redirects to Keycloak end_session" },
                  { route: "/api/auth/dev", desc: "Degraded-mode local session (when KEYCLOAK_URL is unset)" },
                ].map((r) => (
                  <div key={r.route} className="flex items-start justify-between rounded-lg border border-slate-100 p-4">
                    <div>
                      <p className="font-mono text-sm font-medium text-slate-900">{r.route}</p>
                      <p className="text-sm text-slate-500">{r.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded-lg border border-slate-100 p-4">
                <p className="font-medium text-slate-900">RBAC roles</p>
                <div className="mt-3 space-y-2">
                  {[
                    { role: "administrator", scope: "Full platform access" },
                    { role: "radiologist", scope: "Viewer, reporting, workflow review" },
                    { role: "radiographer", scope: "Imaging, workflow execution, equipment" },
                    { role: "receptionist", scope: "Reception, registration, scheduling" },
                    { role: "manager", scope: "Dashboard, reporting, equipment & inventory" },
                  ].map((r) => (
                    <div key={r.role} className="flex items-center justify-between text-sm">
                      <Badge variant="outline">{r.role}</Badge>
                      <span className="text-slate-500">{r.scope}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs text-slate-400">
                  Roles originate from Keycloak <code>realm_access.roles</code> and client-scope mappings, propagated into the session JWT.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="system">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Platform</CardTitle>
                <CardDescription>GeraldOS runtime information</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  ["Version", "1.0.0"],
                  ["Frontend", "Next.js 16 + React 19"],
                  ["ORM", "Drizzle ORM"],
                  ["UI", "Tailwind 4 + shadcn/ui"],
                  ["Tables", "TanStack Table-ready APIs"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">{k}</span>
                    <span className="text-sm font-medium text-slate-900">{v}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Deployment</CardTitle>
                <CardDescription>Full-stack compose bundle</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  "postgres (data store)",
                  "redis (cache & queues)",
                  "minio (object storage)",
                  "orthanc (DICOM server)",
                  "keycloak (identity)",
                  "hapi-fhir (interoperability)",
                  "dicoogle (search)",
                  "n8n (automation)",
                  "ohif (viewer)",
                ].map((name) => (
                  <div key={name} className="flex items-center justify-between">
                    <span className="font-mono text-sm text-slate-700">{name}</span>
                    <Badge variant="outline">docker-compose.yml</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </Shell>
  );
}
