import { useQuery } from "@tanstack/react-query";
import { getList } from "@/lib/api-client";
import { qk } from "@/lib/query-keys";

export function useEvents<T>(pageSize: number, refetchInterval?: number) {
  return useQuery({
    queryKey: qk.events(pageSize),
    queryFn: async () => (await getList<T>(`/api/events?pageSize=${pageSize}`)).data,
    refetchInterval,
  });
}
