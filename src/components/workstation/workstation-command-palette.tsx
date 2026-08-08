"use client";

/**
 * WorkstationCommandPalette — context-aware command palette for the Radiologist Workstation.
 *
 * Intercepted by Ctrl+K (or Cmd+K) within /workstation. Commands adapt to the
 * current study selection and panel state. Unlike the global palette, this one
 * has zero navigation commands — everything is an in-workspace action.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useWorkstation } from "./workstation-context";
import { buildProtocols } from "@/lib/hanging-protocols";
import {
  Search,
  ArrowRight,
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Brain,
  FileText,
  PenLine,
  CheckCircle2,
  Send,
  LayoutGrid,
  PanelLeft,
  PanelRight,
  PanelBottom,
  Maximize,
  Minimize,
  Lightbulb,
  ClipboardList,
  Columns2,
  RotateCw,
  X,
  Keyboard,
  Eye,
  Upload,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Command {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: React.ElementType;
  action: () => void;
  disabled?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function WorkstationCommandPalette({ open, onClose }: Props) {
  const {
    selected, entries, prevStudy, nextStudy, toggleBookmark, isBookmarked,
    runAiReview, runAssist, signReport, releaseStudy, saveDraft, report,
    protocol, setProtocol, layout, updateLayout, fullscreen, toggleFullscreen,
    refreshWorklist, view, setView,
  } = useWorkstation();

  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // ── Build command list ──
  const commands = useMemo<Command[]>(() => {
    const modality = selected?.modality;
    const protocols = buildProtocols(modality);
    const items: Command[] = [];

    // ── Navigation ──
    items.push({
      id: "prev-study",
      label: "Previous study",
      hint: "Alt + ←",
      group: "Navigation",
      icon: ArrowLeft,
      action: () => { prevStudy(); onClose(); },
      disabled: entries.length === 0,
    });
    items.push({
      id: "next-study",
      label: "Next study",
      hint: "Alt + →",
      group: "Navigation",
      icon: ArrowRight,
      action: () => { nextStudy(); onClose(); },
      disabled: entries.length === 0,
    });
    items.push({
      id: "refresh",
      label: "Refresh worklist",
      group: "Navigation",
      icon: RefreshCw,
      action: () => { refreshWorklist(); onClose(); },
    });

    // ── Worklist views ──
    const views: { id: string; label: string; view: string }[] = [
      { id: "view-today", label: "Show Today's Studies", view: "today" },
      { id: "view-unread", label: "Show Unread Studies", view: "unread" },
      { id: "view-stat", label: "Show STAT Cases", view: "stat" },
      { id: "view-emergency", label: "Show Emergency", view: "emergency" },
      { id: "view-assigned", label: "Show Assigned to Me", view: "assigned" },
      { id: "view-completed", label: "Show Completed", view: "completed" },
      { id: "view-all", label: "Show All Studies", view: "all" },
    ];
    for (const v of views) {
      items.push({
        id: v.id,
        label: v.label,
        hint: view === v.view ? "current" : undefined,
        group: "Worklist",
        icon: ClipboardList,
        action: () => { setView(v.view as never); onClose(); },
      });
    }

    // ── Study actions ──
    if (selected) {
      items.push({
        id: "bookmark",
        label: isBookmarked ? "Remove bookmark" : "Bookmark study",
        hint: "Alt + B",
        group: "Study",
        icon: isBookmarked ? BookmarkCheck : Bookmark,
        action: () => { toggleBookmark(); onClose(); },
      });
      items.push({
        id: "ai-review",
        label: "Run AI visual review",
        hint: "Alt + A",
        group: "Study",
        icon: Brain,
        action: () => { runAiReview(); onClose(); },
      });
    }

    // ── Hanging protocols ──
    if (selected && protocols.length > 0) {
      for (const p of protocols) {
        items.push({
          id: `protocol-${p.id}`,
          label: `Protocol: ${p.name}`,
          hint: protocol?.id === p.id ? "active" : `${p.rows}×${p.cols}`,
          group: "Hanging Protocol",
          icon: LayoutGrid,
          action: () => { setProtocol(p); onClose(); },
        });
      }
    }

    // ── Comparison ──
    items.push({
      id: "comparison-toggle",
      label: "Toggle side-by-side comparison",
      hint: "Alt + C",
      group: "Comparison",
      icon: Columns2,
      action: () => {
        window.dispatchEvent(new CustomEvent("workstation:toggle-comparison"));
        onClose();
      },
    });
    items.push({
      id: "comparison-sync",
      label: "Toggle synchronized scrolling",
      group: "Comparison",
      icon: ArrowRight,
      action: () => {
        window.dispatchEvent(new CustomEvent("workstation:toggle-sync-scroll"));
        onClose();
      },
    });

    // ── Panel controls ──
    items.push({
      id: "toggle-worklist",
      label: layout.leftWidth > 0 ? "Hide worklist panel" : "Show worklist panel",
      group: "Panels",
      icon: PanelLeft,
      action: () => { updateLayout({ leftWidth: layout.leftWidth > 0 ? 0 : 320 }); onClose(); },
    });
    items.push({
      id: "toggle-clinical",
      label: layout.rightWidth > 0 ? "Hide clinical panel" : "Show clinical panel",
      group: "Panels",
      icon: PanelRight,
      action: () => { updateLayout({ rightWidth: layout.rightWidth > 0 ? 0 : 380 }); onClose(); },
    });
    items.push({
      id: "toggle-activity",
      label: layout.bottomOpen ? "Hide activity panel" : "Show activity panel",
      group: "Panels",
      icon: PanelBottom,
      action: () => { updateLayout({ bottomOpen: !layout.bottomOpen }); onClose(); },
    });
    items.push({
      id: "toggle-fullscreen",
      label: fullscreen ? "Exit fullscreen" : "Enter fullscreen",
      hint: "F11",
      group: "Panels",
      icon: fullscreen ? Minimize : Maximize,
      action: () => { toggleFullscreen(); onClose(); },
    });

    // ── Reporting ──
    if (selected && report) {
      items.push({
        id: "run-assist",
        label: "AI reporting assist",
        hint: "Suggests findings, templates, quality checks",
        group: "Reporting",
        icon: Lightbulb,
        action: () => { runAssist(); onClose(); },
      });
      items.push({
        id: "save-draft",
        label: "Save report draft",
        group: "Reporting",
        icon: PenLine,
        action: () => { saveDraft(); onClose(); },
        disabled: !report.findings?.trim(),
      });
      items.push({
        id: "sign-report",
        label: "Sign report",
        hint: "Alt + Enter",
        group: "Reporting",
        icon: CheckCircle2,
        action: () => { signReport(); onClose(); },
        disabled: !report.findings?.trim(),
      });
      items.push({
        id: "release-study",
        label: "Release study",
        hint: "Alt + R",
        group: "Reporting",
        icon: Send,
        action: () => { releaseStudy(); onClose(); },
        disabled: report.status !== "signed",
      });
    }

    // ── Upload ──
    items.push({
      id: "upload",
      label: "Upload DICOM studies",
      group: "Tools",
      icon: Upload,
      action: () => {
        // Dispatch a custom event that the worklist panel listens for
        window.dispatchEvent(new CustomEvent("workstation:toggle-upload"));
        onClose();
      },
    });

    // ── Shortcuts help ──
    items.push({
      id: "shortcuts",
      label: "Keyboard shortcuts",
      hint: "Alt + H",
      group: "Help",
      icon: Keyboard,
      action: () => {
        window.dispatchEvent(new CustomEvent("workstation:toggle-shortcuts"));
        onClose();
      },
    });

    return items;
  }, [
    selected, entries, prevStudy, nextStudy, toggleBookmark, isBookmarked,
    runAiReview, runAssist, signReport, releaseStudy, saveDraft, report,
    protocol, setProtocol, layout, updateLayout, fullscreen, toggleFullscreen,
    refreshWorklist, view, setView, onClose,
  ]);

  // ── Filter ──
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        (c.hint ?? "").toLowerCase().includes(q) ||
        c.group.toLowerCase().includes(q)
    );
  }, [commands, query]);

  useEffect(() => setSelectedIdx(0), [query]);

  // ── Group ──
  const groups = useMemo(() => {
    const map = new Map<string, Command[]>();
    for (const c of filtered) {
      const arr = map.get(c.group) ?? [];
      arr.push(c);
      map.set(c.group, arr);
    }
    return [...map.entries()];
  }, [filtered]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-950/50 pt-[12vh] backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 dark:border-slate-800">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx((s) => Math.min(s + 1, filtered.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIdx((s) => Math.max(s - 1, 0)); }
              if (e.key === "Enter" && filtered[selectedIdx] && !filtered[selectedIdx].disabled) {
                filtered[selectedIdx].action();
              }
              if (e.key === "Escape") onClose();
            }}
            placeholder="Search workstation commands…"
            className="h-11 w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
          />
          <kbd className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 dark:border-slate-700">ESC</kbd>
        </div>

        {/* Commands */}
        <div className="max-h-80 overflow-y-auto p-2">
          {groups.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-slate-400">No matching commands</p>
          )}
          {groups.map(([group, items]) => (
            <div key={group}>
              <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{group}</p>
              {items.map((cmd) => {
                const idx = filtered.indexOf(cmd);
                return (
                  <button
                    key={cmd.id}
                    onMouseEnter={() => setSelectedIdx(idx)}
                    onClick={() => { if (!cmd.disabled) cmd.action(); }}
                    disabled={cmd.disabled}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                      cmd.disabled
                        ? "cursor-not-allowed opacity-40"
                        : idx === selectedIdx
                          ? "bg-brand-soft text-brand-text"
                          : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                    )}
                  >
                    <cmd.icon className={cn(
                      "h-4 w-4 flex-shrink-0",
                      idx === selectedIdx ? "text-brand" : "text-slate-400"
                    )} />
                    <span className="flex-1 font-medium">{cmd.label}</span>
                    {cmd.hint && (
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">{cmd.hint}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 dark:border-slate-800">
          <div className="flex items-center gap-3 text-[10px] text-slate-400">
            <span><kbd className="rounded border border-slate-200 px-1 py-px font-mono dark:border-slate-700">↑↓</kbd> navigate</span>
            <span><kbd className="rounded border border-slate-200 px-1 py-px font-mono dark:border-slate-700">↵</kbd> select</span>
          </div>
          <span className="text-[10px] text-slate-500">
            {filtered.length} command{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
