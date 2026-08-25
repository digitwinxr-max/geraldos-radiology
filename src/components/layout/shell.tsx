"use client";

import React from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { useAppShell } from "@/components/app-shell-context";
import { cn } from "@/lib/utils";

interface ShellProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}

export function Shell({ title, description, children, actions }: ShellProps) {
  const { sidebarCollapsed } = useAppShell();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Skip link — invisible until focused (WCAG 2.4.1). */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:shadow-lg dark:focus:bg-slate-900"
      >
        Skip to content
      </a>
      <Sidebar />
      <div className={cn("transition-[margin] duration-200", sidebarCollapsed ? "ml-16" : "ml-64")}>
        <Header title={title} description={description} />
        <main id="main-content" tabIndex={-1} className="p-8">
          {actions && (
            <div className="mb-6 flex items-center justify-between">
              <div />
              <div className="flex items-center gap-3">{actions}</div>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
