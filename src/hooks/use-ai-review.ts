import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getList, mutate } from "@/lib/api-client";
import { qk } from "@/lib/query-keys";

export interface AiReviewFilters {
  studyId?: string;
  orthancStudyId?: string;
  status?: string;
}

export function useAiReviewObservations<T>(filters: AiReviewFilters, enabled = true) {
  return useQuery({
    queryKey: qk.aiReview(filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.studyId) params.set("studyId", filters.studyId);
      if (filters.orthancStudyId) params.set("orthancStudyId", filters.orthancStudyId);
      if (filters.status) params.set("status", filters.status);
      const qs = params.toString();
      return (await getList<T>(`/api/ai-review${qs ? `?${qs}` : ""}`)).data;
    },
    enabled,
  });
}

export function useRunAiReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => mutate("POST", "/api/ai-review", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-review"] }),
  });
}

/** Accept/reject keeps the pages' optimistic local update, then refreshes the cache. */
export function useReviewObservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      mutate("PATCH", `/api/ai-review/${id}`, body),
    onSettled: () => qc.invalidateQueries({ queryKey: ["ai-review"] }),
  });
}
