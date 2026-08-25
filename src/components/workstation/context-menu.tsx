"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface ContextMenuItem {
  label: string;
  icon?: React.ElementType;
  action: () => void;
  destructive?: boolean;
  disabled?: boolean;
  divider?: boolean;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  position: { x: number; y: number };
  onClose: () => void;
}

export function ContextMenu({ items, position, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const initialFocusDone = useRef(false);
  // Capture the opener so Escape can return focus to it.
  const openerRef = useRef<Element | null>(null);
  useEffect(() => {
    if (!openerRef.current) openerRef.current = document.activeElement;
  }, []);
  const enabledIndices = items
    .map((item, i) => (!item.divider && !item.disabled ? i : -1))
    .filter((i) => i >= 0);

  // Focus the first enabled item when the menu opens (once per mount).
  useEffect(() => {
    if (initialFocusDone.current) return;
    const firstEnabled = items.findIndex((item) => !item.divider && !item.disabled);
    if (firstEnabled < 0) return;
    initialFocusDone.current = true;
    itemRefs.current[firstEnabled]?.focus();
  }, [items]);

  // Arrow/Home/End navigation between enabled menu items.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (enabledIndices.length === 0) return;
    const currentIdx = itemRefs.current.findIndex((el) => el === document.activeElement);
    const pos = enabledIndices.indexOf(currentIdx);
    const move = (target: number) => itemRefs.current[enabledIndices[target]]?.focus();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(pos < 0 ? 0 : (pos + 1) % enabledIndices.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(pos <= 0 ? enabledIndices.length - 1 : pos - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      move(0);
    } else if (e.key === "End") {
      e.preventDefault();
      move(enabledIndices.length - 1);
    }
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Close on Escape and return focus to the opener.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        if (openerRef.current instanceof HTMLElement) openerRef.current.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Adjust position to stay within viewport
  const adjustedPosition = React.useMemo(() => {
    if (typeof window === "undefined") return position;
    const menuWidth = 220;
    const menuHeight = items.length * 36;
    let x = position.x;
    let y = position.y;
    if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 8;
    if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 8;
    return { x: Math.max(0, x), y: Math.max(0, y) };
  }, [position, items.length]);

  return (
    <div
      ref={menuRef}
      role="menu"
      onKeyDown={onKeyDown}
      className="fixed z-50 min-w-[200px] rounded-xl border border-slate-200 bg-white p-1 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      style={{ left: adjustedPosition.x, top: adjustedPosition.y }}
    >
      {items.map((item, i) => {
        if (item.divider) {
          return <div key={`d-${i}`} className="my-1 border-t border-slate-100 dark:border-slate-800" />;
        }
        const Icon = item.icon;
        return (
          <button
            key={item.label}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            role="menuitem"
            onClick={() => {
              item.action();
              onClose();
            }}
            disabled={item.disabled}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
              item.destructive
                ? "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800",
              item.disabled && "cursor-not-allowed opacity-40"
            )}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

/** Hook for managing context menu state in a worklist item. */
export function useContextMenu() {
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);

  const onContextMenu = useCallback((e: React.MouseEvent, items: ContextMenuItem[]) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, items });
  }, []);

  const close = useCallback(() => setMenu(null), []);

  return { menu, onContextMenu, close };
}
