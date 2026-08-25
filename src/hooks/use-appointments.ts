import { useQuery } from "@tanstack/react-query";
import { getList } from "@/lib/api-client";
import { qk } from "@/lib/query-keys";

export function useAppointments<T>() {
  return useQuery({
    queryKey: qk.appointments(),
    queryFn: async () => (await getList<T>("/api/appointments")).data,
  });
}
