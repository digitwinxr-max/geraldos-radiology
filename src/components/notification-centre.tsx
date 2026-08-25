"use client";

import React, { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, AlertTriangle, Info, CheckCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useNotifications,
  useMarkNotificationRead,
  useDismissNotification,
  type NotificationsEnvelope,
} from "@/hooks/use-notifications";
import { qk } from "@/lib/query-keys";

interface Notification {
  id: string;
  title: string;
  body: string | null;
  type: string;
  severity: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

const TYPE_ICON: Record<string, { icon: React.ElementType; className: string }> = {
  alert: { icon: AlertTriangle, className: "text-amber-600 dark:text-amber-400" },
  warning: { icon: AlertTriangle, className: "text-amber-600 dark:text-amber-400" },
  success: { icon: CheckCircle, className: "text-emerald-600 dark:text-emerald-400" },
  info: { icon: Info, className: "text-brand" },
};

export function NotificationCentre() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 25 s polling parity, exposed through refetchInterval.
  const notificationsQuery = useNotifications<Notification>(30, 25_000);
  const markRead = useMarkNotificationRead();
  const dismissMutation = useDismissNotification();
  const items = notificationsQuery.data?.data ?? [];
  const unread = notificationsQuery.data?.unread ?? 0;
  const loading = notificationsQuery.isFetching;

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const patchEnvelope = (updater: (prev: NotificationsEnvelope<Notification>) => NotificationsEnvelope<Notification>) => {
    qc.setQueryData<NotificationsEnvelope<Notification> | undefined>(qk.notifications(30), (prev) => (prev ? updater(prev) : prev));
  };

  const markAllRead = async () => {
    await Promise.all(items.filter((i) => !i.read).map((i) => markRead.mutateAsync(i.id).catch(() => {})));
    // Optimistic update (parity), then the onSettled invalidation reconciles.
    patchEnvelope((prev) => ({ ...prev, unread: 0, data: prev.data.map((i) => ({ ...i, read: true })) }));
  };

  const dismiss = async (id: string) => {
    await dismissMutation.mutateAsync(id).catch(() => {});
    patchEnvelope((prev) => ({ ...prev, data: prev.data.filter((i) => i.id !== id) }));
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        title="Notification centre"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-96 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Notifications</p>
              <p className="text-xs text-slate-400">{unread} unread</p>
            </div>
            {unread > 0 && (
              <button onClick={markAllRead} className="flex items-center gap-1 text-xs font-medium text-brand-text hover:text-brand-active">
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 && !loading && (
              <p className="px-4 py-10 text-center text-sm text-slate-400">No notifications yet</p>
            )}
            {items.map((n) => {
              const cfg = TYPE_ICON[n.type] ?? TYPE_ICON.info;
              return (
                <div key={n.id} className={cn("group flex gap-3 border-b border-slate-50 px-4 py-3 last:border-0 dark:border-slate-800", !n.read && "bg-brand-soft/50")}>
                  <cfg.icon className={cn("mt-0.5 h-4 w-4 flex-shrink-0", cfg.className)} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{n.title}</p>
                    {n.body && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{n.body}</p>}
                    <p className="mt-0.5 text-[10px] text-slate-400">{new Date(n.createdAt).toLocaleString()}</p>
                  </div>
                  <button onClick={() => dismiss(n.id)} className="hidden text-slate-300 hover:text-slate-500 group-hover:block dark:text-slate-600">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
