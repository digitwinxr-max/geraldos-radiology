import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getList, getJson, mutate } from "@/lib/api-client";
import { qk } from "@/lib/query-keys";

/** Workflow studies — pages historically rendered the full set, so request the max page. */
export function useWorkflowStudies<T>() {
  return useQuery({
    queryKey: qk.workflow(),
    queryFn: async () => (await getList<T>("/api/workflow?pageSize=200")).data,
  });
}

export function useWorklistFacets<T>() {
  return useQuery({
    queryKey: qk.worklistFacets(),
    queryFn: () => getJson<T>("/api/worklist/facets"),
  });
}

/** Stage transition / assign / field PATCH on a workflow study. */
export function useTransitionStudy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      mutate("PATCH", `/api/workflow/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workflow"] });
      qc.invalidateQueries({ queryKey: ["worklist"] });
    },
  });
}
