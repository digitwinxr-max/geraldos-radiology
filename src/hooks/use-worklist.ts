import { useQuery } from "@tanstack/react-query";
import { getList } from "@/lib/api-client";
import { qk, type WorklistFilters } from "@/lib/query-keys";

const WORKLIST_PAGE_SIZE = 200;
const WORKLIST_POLL_MS = 30_000;

function worklistUrl(view: string, filters: WorklistFilters) {
  const params = new URLSearchParams({ view });
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  params.set("pageSize", String(WORKLIST_PAGE_SIZE));
  return `/api/worklist?${params.toString()}`;
}

/** Filtered worklist view, polled every 30 s (parity with the old interval). */
export function useWorklist<T>(view: string, filters: WorklistFilters, enabled = true) {
  return useQuery({
    queryKey: qk.worklist(view, filters),
    queryFn: async () => (await getList<T>(worklistUrl(view, filters))).data,
    refetchInterval: WORKLIST_POLL_MS,
    enabled,
  });
}

/** Unfiltered dataset that powers the view counters (stable across view switches). */
export function useWorklistAll<T>(enabled = true) {
  return useQuery({
    queryKey: qk.worklist("all", {}),
    queryFn: async () => (await getList<T>(worklistUrl("all", {}))).data,
    refetchInterval: WORKLIST_POLL_MS,
    enabled,
  });
}
