import { createRemoteJWKSet, jwtVerify } from "jose";
import { integrationConfig } from "@/lib/integrations";

interface OidcDiscovery {
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint?: string;
  jwks_uri: string;
  issuer: string;
}

let discoveryCache: { issuer: string; config: OidcDiscovery } | null = null;

export function keycloakConfigured(): boolean {
  return Boolean(integrationConfig.keycloak.url);
}

export async function discoverOidc(): Promise<OidcDiscovery> {
  const issuer = integrationConfig.keycloak.issuer;
  if (!issuer) throw new Error("KEYCLOAK_URL is not configured");
  if (discoveryCache && discoveryCache.issuer === issuer) return discoveryCache.config;
  const res = await fetch(`${issuer}/.well-known/openid-configuration`, {
    signal: AbortSignal.timeout(5000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`OIDC discovery failed: HTTP ${res.status}`);
  const config = (await res.json()) as OidcDiscovery;
  discoveryCache = { issuer, config };
  return config;
}

export function buildAuthorizationUrl(
  oidc: OidcDiscovery,
  redirectUri: string,
  state: string
): string {
  const cfg = integrationConfig.keycloak;
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: "code",
    scope: "openid profile email",
    redirect_uri: redirectUri,
    state,
  });
  return `${oidc.authorization_endpoint}?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  oidc: OidcDiscovery,
  code: string,
  redirectUri: string
): Promise<{ id_token: string; access_token: string }> {
  const cfg = integrationConfig.keycloak;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: cfg.clientId,
    code,
    redirect_uri: redirectUri,
  });
  if (cfg.clientSecret) body.set("client_secret", cfg.clientSecret);

  const res = await fetch(oidc.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Token exchange failed: HTTP ${res.status}`);
  return (await res.json()) as { id_token: string; access_token: string };
}

export interface KeycloakClaims {
  sub: string;
  name?: string;
  preferred_username?: string;
  email?: string;
  realm_access?: { roles?: string[] };
  resource_access?: Record<string, { roles?: string[] }>;
}

export async function verifyIdToken(oidc: OidcDiscovery, idToken: string): Promise<KeycloakClaims> {
  const jwks = createRemoteJWKSet(new URL(oidc.jwks_uri));
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: integrationConfig.keycloak.issuer,
    audience: integrationConfig.keycloak.clientId,
  });
  return payload as KeycloakClaims;
}

export function extractRoles(claims: KeycloakClaims): string[] {
  const realmRoles = claims.realm_access?.roles ?? [];
  const clientRoles =
    claims.resource_access?.[integrationConfig.keycloak.clientId]?.roles ?? [];
  return [...new Set([...realmRoles, ...clientRoles])];
}
