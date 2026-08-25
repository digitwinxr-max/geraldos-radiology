import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getList, mutate } from "@/lib/api-client";
import { qk } from "@/lib/query-keys";

export function useEquipment<T>() {
  return useQuery({
    queryKey: qk.equipment(),
    queryFn: async () => (await getList<T>("/api/equipment")).data,
  });
}

export function useCreateEquipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => mutate("POST", "/api/equipment", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.equipment() }),
  });
}
