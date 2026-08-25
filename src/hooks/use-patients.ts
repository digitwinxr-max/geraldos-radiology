import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getList, mutate } from "@/lib/api-client";
import { qk } from "@/lib/query-keys";

/** Patient list, keyed by search term (reception refetches on every keystroke). */
export function usePatients<T>(search?: string) {
  return useQuery({
    queryKey: qk.patients(search),
    queryFn: async () => {
      const params = search ? `?search=${encodeURIComponent(search)}` : "";
      return (await getList<T>(`/api/patients${params}`)).data;
    },
  });
}

export function useCreatePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => mutate("POST", "/api/patients", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["patients"] }),
  });
}
