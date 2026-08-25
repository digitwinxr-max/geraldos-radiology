import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getList, mutate } from "@/lib/api-client";
import { qk } from "@/lib/query-keys";

export function useBookmarks<T>() {
  return useQuery({
    queryKey: qk.bookmarks(),
    queryFn: async () => (await getList<T>("/api/bookmarks")).data,
  });
}

export function useCreateBookmark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => mutate("POST", "/api/bookmarks", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.bookmarks() }),
  });
}

export function useDeleteBookmark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mutate("DELETE", `/api/bookmarks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.bookmarks() }),
  });
}
