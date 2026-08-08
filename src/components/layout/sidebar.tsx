"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAppShell } from "@/components/app-shell-context";
import {
  Activity,
  UserPlus,
  Calendar,
  GitBranch,
  Image,
  Wrench,
  Package,
  FileText,
  Settings,
  Bot,
  Receipt,
  Building2,
  BookOpen,
  ScanSearch,
  MonitorSmartphone,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

// accent: subtle semantic tint per section (active state only) —
// azure remains the default brand accent for every item.
const navigation: {
  name: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
  accent?: string;
}[] = [
  { name: "Workstation", href: "/workstation", icon: MonitorSmartphone, badge: "Primary" },
  { name: "Command Centre", href: "/", icon: Activity },
  { name: "Reception", href: "/reception", icon: UserPlus },
  { name: "Scheduling", href: "/scheduling", icon: Calendar },
  { name: "Workflow", href: "/workflow", icon: GitBranch },
  { name: "Imaging", href: "/imaging", icon: Image },
  { name: "AI Review", href: "/review", icon: ScanSearch, accent: "text-ai" },
  { name: "Reporting", href: "/reporting", icon: FileText },
  { name: "Knowledge", href: "/knowledge", icon: BookOpen },
  { name: "Equipment", href: "/equipment", icon: Wrench, accent: "text-operational" },
  { name: "Inventory", href: "/inventory", icon: Package },
  { name: "Finance", href: "/finance", icon: Receipt, accent: "text-premium" },
  { name: "Administration", href: "/administration", icon: Building2 },
  { name: "AI Agents", href: "/agents", icon: Bot, accent: "text-ai" },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useAppShell();

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-slate-200 bg-white transition-[width] duration-200 dark:border-slate-800 dark:bg-slate-950",
        sidebarCollapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo */}
      <div className={cn("flex h-16 items-center border-b border-slate-200 dark:border-slate-800", sidebarCollapsed ? "justify-center px-2" : "gap-3 px-6")}>
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/gh-logo.png" alt="GH logo" className="h-9 w-9 object-contain" />
        </div>
        {!sidebarCollapsed && (
          <div className="min-w-0">
            <h1 className="truncate text-[13px] font-bold leading-tight text-slate-900 dark:text-slate-100">MEDICAL DIAGNOSTIC IMAGING</h1>
            <p className="truncate text-[10px] font-medium uppercase tracking-wider text-slate-400">
              Fluent in Imaging
            </p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          const active = isActive;
          return (
            <Link
              key={item.name}
              href={item.href}
              title={sidebarCollapsed ? item.name : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg py-2.5 text-sm font-medium transition-colors",
                sidebarCollapsed ? "justify-center px-0" : "px-3",
                active
                  ? "bg-brand-soft text-brand-text"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-200"
              )}
            >
              <item.icon className={cn("h-5 w-5 flex-shrink-0", active ? (item.accent ?? "text-brand") : "text-slate-400 dark:text-slate-500")} />
              {!sidebarCollapsed && <span className="truncate">{item.name}</span>}
              {!sidebarCollapsed && "badge" in item && item.badge && (
                <span className="ml-auto shrink-0 rounded-full bg-brand-hover px-1.5 py-0.5 text-[9px] font-semibold text-white">{item.badge}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-800">
        <div className={cn("flex items-center gap-3", sidebarCollapsed && "justify-center")}>
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            GH
          </div>
          {!sidebarCollapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">Gerald Holdings</p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">Administrator</p>
            </div>
          )}
          {!sidebarCollapsed && (
            <button
              onClick={toggleSidebar}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              title="Collapse sidebar (Ctrl+B)"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}
        </div>
        {sidebarCollapsed && (
          <button
            onClick={toggleSidebar}
            className="mt-3 flex w-full items-center justify-center rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            title="Expand sidebar (Ctrl+B)"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}
      </div>
    </aside>
  );
}
