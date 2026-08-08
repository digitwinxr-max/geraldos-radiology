"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, AlertTriangle, Info, CheckCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications?limit=30");
      const data = await res.json();
      if (data.ok) {
        setItems(data.notifications ?? []);
        setUnread(Number(data.unread ?? 0));
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
    const timer = setInterval(fetchItems, 25000);
    return () => clearInterval(timer);
  }, [fetchItems]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const markAllRead = async () => {
    await Promise.all(
      items.filter((i) => !i.read).map((i) => fetch(`/api/notifications/${i.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ read: true }) }))
    );
    setItems((list) => list.map((i) => ({ ...i, read: true })));
    setUnread(0);
  };

  const dismiss = async (id: string) => {
    await fetch(`/api/notifications/${id}`, { method: "DELETE" });
    setItems((list) => list.filter((i) => i.id !== id));
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
