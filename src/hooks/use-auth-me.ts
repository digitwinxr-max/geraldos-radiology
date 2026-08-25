import { useQuery } from "@tanstack/react-query";
import { getJson } from "@/lib/api-client";
import { qk } from "@/lib/query-keys";

/**
 * Current signed-in identity. Parity with the header's
 * `r.ok ? r.json() : null` — failures resolve to `null`, never error state.
 */
export function useAuthMe<T>() {
  return useQuery({
    queryKey: qk.authMe(),
    queryFn: () => getJson<T>("/api/auth/me").catch(() => null),
    retry: false,
  });
}
