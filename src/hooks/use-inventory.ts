import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getList, mutate } from "@/lib/api-client";
import { qk } from "@/lib/query-keys";

export function useInventory<T>() {
  return useQuery({
    queryKey: qk.inventory(),
    queryFn: async () => (await getList<T>("/api/inventory")).data,
  });
}

export function useCreateInventoryItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => mutate("POST", "/api/inventory", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.inventory() }),
  });
}
