import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getList, mutate } from "@/lib/api-client";
import { qk } from "@/lib/query-keys";

/** Knowledge search — keyed by category + query (the page refetches per keystroke; no debounce by design). */
export function useKnowledgeDocuments<T>(category: string, q: string) {
  return useQuery({
    queryKey: qk.knowledge(category, q),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (category !== "all") params.set("category", category);
      if (q) params.set("q", q);
      const qs = params.toString();
      return (await getList<T>(`/api/knowledge${qs ? `?${qs}` : ""}`)).data;
    },
  });
}

export function useCreateKnowledgeDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => mutate("POST", "/api/knowledge", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["knowledge"] }),
  });
}
