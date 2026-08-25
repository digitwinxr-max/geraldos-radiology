import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getList, mutate, type ListEnvelope } from "@/lib/api-client";
import { qk } from "@/lib/query-keys";

export type NotificationsEnvelope<T> = ListEnvelope<T> & { unread: number };

export function useNotifications<T>(pageSize: number, refetchInterval?: number) {
  return useQuery({
    queryKey: qk.notifications(pageSize),
    queryFn: () => getList<T, { unread: number }>(`/api/notifications?pageSize=${pageSize}`),
    refetchInterval,
  });
}

/** Mark one notification read; callers keep their optimistic UI via onMutate. */
export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mutate("PATCH", `/api/notifications/${id}`, { read: true }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useDismissNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mutate("DELETE", `/api/notifications/${id}`),
    onSettled: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}
