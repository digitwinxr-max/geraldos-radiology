import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getList, mutate } from "@/lib/api-client";
import { qk } from "@/lib/query-keys";

export function useEmployees<T>() {
  return useQuery({
    queryKey: qk.employees(),
    queryFn: async () => (await getList<T>("/api/employees")).data,
  });
}

export function useBranches<T>() {
  return useQuery({
    queryKey: qk.branches(),
    queryFn: async () => (await getList<T>("/api/branches")).data,
  });
}

export function useRoles<T>() {
  return useQuery({
    queryKey: qk.roles(),
    queryFn: async () => (await getList<T>("/api/roles")).data,
  });
}

export function useStaff<T>() {
  return useQuery({
    queryKey: qk.staff(),
    queryFn: async () => (await getList<T>("/api/staff")).data,
  });
}

/** The administration page re-fetched all four lists after either create. */
export function useAdministrationMutation(path: "/api/employees" | "/api/branches") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => mutate("POST", path, body),
    onSuccess: () => {
      for (const key of [qk.employees(), qk.branches(), qk.roles(), qk.staff()]) {
        qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}
