import { useQuery } from "@tanstack/react-query";
import { getJson } from "@/lib/api-client";
import { qk } from "@/lib/query-keys";

export interface ClientConfig {
  keycloakEnabled?: boolean;
  langgraphEnabled?: boolean;
  [key: string]: unknown;
}

/**
 * Public (non-secret) integration config. Shared single query — login, agents,
 * imaging and workstation-context all read the same data.
 */
export function useIntegrationsClientConfig() {
  return useQuery({
    queryKey: qk.integrationsClientConfig(),
    queryFn: () => getJson<ClientConfig>("/api/integrations/client-config"),
    // Parity: consumers silently swallow failures (login falls back to false).
    retry: false,
  });
}

/** Integration health status — settings page drives refresh via refetch(). */
export function useIntegrationsStatus<T = { integrations: unknown[] }>() {
  return useQuery({
    queryKey: qk.integrationsStatus(),
    queryFn: () => getJson<T>("/api/integrations/status"),
    retry: false,
  });
}
