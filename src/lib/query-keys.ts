/**
 * GeraldOS Query-Key Factory
 *
 * Every React Query hook derives its key from here so invalidation can target
 * a whole domain (e.g. `["reports"]`) or one exact resource. Keys are arrays
 * with a stable domain prefix followed by the resource discriminator.
 */

export interface WorklistFilters {
  q?: string;
  modality?: string;
  radiologist?: string;
  machine?: string;
  physician?: string;
  location?: string;
  priority?: string;
}

export const qk = {
  // Operations
  patients: (search?: string) => ["patients", { search: search ?? "" }] as const,
  appointments: () => ["appointments"] as const,
  workflow: () => ["workflow"] as const,
  worklist: (view: string, filters: WorklistFilters) => ["worklist", view, filters] as const,
  worklistFacets: () => ["worklist", "facets"] as const,

  // Finance
  invoices: () => ["invoices"] as const,
  payments: () => ["payments"] as const,
  claims: () => ["claims"] as const,
  tariffs: () => ["tariffs"] as const,
  expenses: () => ["expenses"] as const,
  financeAnalytics: () => ["finance", "analytics"] as const,

  // Administration
  staff: () => ["staff"] as const,
  employees: () => ["employees"] as const,
  roles: () => ["roles"] as const,
  branches: () => ["branches"] as const,

  // Clinical
  reports: (patientId?: string) => ["reports", { patientId: patientId ?? "" }] as const,
  reportDetail: (reportId: string) => ["reports", "detail", reportId] as const,
  reportTemplates: () => ["reports", "templates"] as const,
  reportVersions: (reportId: string) => ["reports", "versions", reportId] as const,
  aiReview: (filters: { studyId?: string; orthancStudyId?: string; status?: string }) => ["ai-review", filters] as const,
  annotations: (filters: { studyId?: string; orthancStudyId?: string }) => ["annotations", filters] as const,
  bookmarks: () => ["bookmarks"] as const,
  knowledge: (category: string, q: string) => ["knowledge", { category, q }] as const,

  // Platform
  events: (pageSize: number) => ["events", { pageSize }] as const,
  notifications: (pageSize: number) => ["notifications", { pageSize }] as const,
  decisions: (status?: string) => ["decisions", { status: status ?? "" }] as const,
  equipment: () => ["equipment"] as const,
  inventory: () => ["inventory"] as const,
  commandCentre: () => ["command-centre"] as const,
  integrationsClientConfig: () => ["integrations", "client-config"] as const,
  integrationsStatus: () => ["integrations", "status"] as const,
  authMe: () => ["auth", "me"] as const,
} as const;

/**
 * Stale time for near-static reference data (tariffs, knowledge, branches).
 * These queries skip re-fetching for 5 minutes across mounts; mutations still
 * force an immediate refresh because they invalidate the matching keys.
 */
export const NEAR_STATIC_STALE_MS = 5 * 60 * 1000;
