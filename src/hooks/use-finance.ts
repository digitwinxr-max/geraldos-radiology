import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getList, getJson, mutate } from "@/lib/api-client";
import { NEAR_STATIC_STALE_MS, qk } from "@/lib/query-keys";

export function useInvoices<T>() {
  return useQuery({
    queryKey: qk.invoices(),
    queryFn: async () => (await getList<T>("/api/invoices")).data,
  });
}

export function usePayments<T>() {
  return useQuery({
    queryKey: qk.payments(),
    queryFn: async () => (await getList<T>("/api/payments")).data,
  });
}

export function useClaims<T>() {
  return useQuery({
    queryKey: qk.claims(),
    queryFn: async () => (await getList<T>("/api/claims")).data,
  });
}

export function useTariffs<T>() {
  return useQuery({
    queryKey: qk.tariffs(),
    queryFn: async () => (await getList<T>("/api/tariffs")).data,
    // Near-static reference data; finance mutations invalidate this key.
    staleTime: NEAR_STATIC_STALE_MS,
  });
}

export function useExpenses<T>() {
  return useQuery({
    queryKey: qk.expenses(),
    queryFn: async () => (await getList<T>("/api/expenses")).data,
  });
}

/** Non-envelope analytics snapshot. */
export function useFinanceAnalytics<T>() {
  return useQuery({
    queryKey: qk.financeAnalytics(),
    queryFn: () => getJson<T>("/api/finance/analytics"),
  });
}

/**
 * The finance page re-fetched its whole dashboard after every mutation;
 * mirror that by invalidating every finance domain + patients in one shot.
 */
export function useFinanceMutation(method: "POST", path: "/api/invoices" | "/api/payments" | "/api/claims") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => mutate(method, path, body),
    onSuccess: () => {
      for (const key of [qk.invoices(), qk.payments(), qk.claims(), qk.tariffs(), qk.financeAnalytics(), ["patients"]]) {
        qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}
