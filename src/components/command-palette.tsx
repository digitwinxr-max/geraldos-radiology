"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppShell } from "@/components/app-shell-context";
import {
  LayoutDashboard,
  UserPlus,
  Calendar,
  GitBranch,
  Image,
  Wrench,
  Package,
  FileText,
  Receipt,
  Building2,
  Bot,
  Settings,
  BookOpen,
  ScanSearch,
  Activity,
  Search,
  MonitorSmartphone,
  LayoutPanelTop,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Command {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: React.ElementType;
  action: () => void;
}

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, toggleTheme, theme } = useAppShell();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Restore focus to the opener when the palette closes.
  const prevFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (paletteOpen) {
      prevFocusRef.current = (document.activeElement as HTMLElement) ?? null;
      setQuery("");
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    } else {
      prevFocusRef.current?.focus();
      prevFocusRef.current = null;
    }
  }, [paletteOpen]);

  const commands = useMemo<Command[]>(() => {
    const nav = (href: string) => () => {
      setPaletteOpen(false);
      router.push(href);
    };
    const items: Command[] = [
      { id: "ws", label: "Radiologist Workstation", hint: "Primary workspace: viewer, AI, reporting", group: "Navigate", icon: LayoutPanelTop, action: nav("/workstation") },
      { id: "cc", label: "Operations Command Centre", hint: "/", group: "Navigate", icon: Activity, action: nav("/") },
      { id: "reception", label: "Reception", hint: "Patients & check-in", group: "Navigate", icon: UserPlus, action: nav("/reception") },
      { id: "scheduling", label: "Scheduling", hint: "Appointments", group: "Navigate", icon: Calendar, action: nav("/scheduling") },
      { id: "workflow", label: "Clinical Workflow", hint: "Study pipeline", group: "Navigate", icon: GitBranch, action: nav("/workflow") },
      { id: "imaging", label: "Imaging Workspace", hint: "OHIF viewer", group: "Navigate", icon: Image, action: nav("/imaging") },
      { id: "review", label: "AI Review", hint: "Candidate observations", group: "Navigate", icon: ScanSearch, action: nav("/review") },
      { id: "reporting", label: "Reporting", hint: "AI-assisted reports", group: "Navigate", icon: FileText, action: nav("/reporting") },
      { id: "knowledge", label: "Knowledge Platform", hint: "SOPs & protocols", group: "Navigate", icon: BookOpen, action: nav("/knowledge") },
      { id: "equipment", label: "Equipment", group: "Navigate", icon: Wrench, action: nav("/equipment") },
      { id: "inventory", label: "Inventory", group: "Navigate", icon: Package, action: nav("/inventory") },
      { id: "finance", label: "Finance", group: "Navigate", icon: Receipt, action: nav("/finance") },
      { id: "agents", label: "AI Agents", hint: "9 specialised agents", group: "Navigate", icon: Bot, action: nav("/agents") },
      { id: "administration", label: "Administration", group: "Navigate", icon: Building2, action: nav("/administration") },
      { id: "settings", label: "Settings", group: "Navigate", icon: Settings, action: nav("/settings") },
      { id: "theme", label: theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode", hint: "Toggle theme", group: "Actions", icon: MonitorSmartphone, action: () => { toggleTheme(); setPaletteOpen(false); } },
    ];
    return items;
  }, [router, setPaletteOpen, toggleTheme, theme]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q) || (c.hint ?? "").toLowerCase().includes(q) || c.group.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => setSelected(0), [query]);

  const groups = useMemo(() => {
    const map = new Map<string, Command[]>();
    for (const c of filtered) {
      (map.get(c.group) ?? map.set(c.group, []).get(c.group)!).push(c);
    }
    return [...map.entries()];
  }, [filtered]);

  if (!paletteOpen) return null;

  const run = (cmd: Command) => cmd.action();

  // Keep Tab cycling inside the palette while it is open.
  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !panelRef.current) return;
    const focusables = panelRef.current.querySelectorAll<HTMLElement>("input, button:not([disabled])");
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const activeOption = filtered[selected];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onKeyDown={trapTab}
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/40 pt-[15vh] backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) setPaletteOpen(false); }}
    >
      <div ref={panelRef} className="w-full max-w-xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 dark:border-slate-800">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-listbox"
            aria-activedescendant={activeOption ? `command-palette-option-${activeOption.id}` : undefined}
            aria-autocomplete="list"
            aria-label="Search pages, tools and actions"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(s + 1, filtered.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
              if (e.key === "Enter" && filtered[selected]) run(filtered[selected]);
              if (e.key === "Escape") setPaletteOpen(false);
            }}
            placeholder="Search pages, tools and actions…"
            className="h-12 w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
          />
          <kbd className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 dark:border-slate-700">ESC</kbd>
        </div>
        <div id="command-palette-listbox" role="listbox" aria-label="Commands" className="max-h-96 overflow-y-auto p-2">
          {groups.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-slate-400">No matching commands</p>
          )}
          {groups.map(([group, items]) => (
            <div key={group} role="presentation">
              <p role="presentation" className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{group}</p>
              {items.map((cmd) => {
                const idx = filtered.indexOf(cmd);
                return (
                  <button
                    key={cmd.id}
                    id={`command-palette-option-${cmd.id}`}
                    role="option"
                    aria-selected={idx === selected}
                    onMouseEnter={() => setSelected(idx)}
                    onClick={() => run(cmd)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                      idx === selected ? "bg-brand-soft text-brand-text" : "text-slate-700 dark:text-slate-200"
                    )}
                  >
                    <cmd.icon className={cn("h-4 w-4 flex-shrink-0", idx === selected ? "text-brand" : "text-slate-400")} />
                    <span className="flex-1 font-medium">{cmd.label}</span>
                    {cmd.hint && <span className="text-xs text-slate-400">{cmd.hint}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
