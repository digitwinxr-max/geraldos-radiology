import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getList, mutate } from "@/lib/api-client";
import { qk } from "@/lib/query-keys";

export interface AnnotationFilters {
  studyId?: string;
  orthancStudyId?: string;
}

export function useAnnotations<T>(filters: AnnotationFilters, enabled = true) {
  return useQuery({
    queryKey: qk.annotations(filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.studyId) params.set("studyId", filters.studyId);
      if (filters.orthancStudyId) params.set("orthancStudyId", filters.orthancStudyId);
      const qs = params.toString();
      return (await getList<T>(`/api/annotations${qs ? `?${qs}` : ""}`)).data;
    },
    enabled,
  });
}

export function useCreateAnnotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => mutate("POST", "/api/annotations", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["annotations"] }),
  });
}

export function useDeleteAnnotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mutate("DELETE", `/api/annotations/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["annotations"] }),
  });
}
