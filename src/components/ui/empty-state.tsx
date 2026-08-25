import * as React from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface EmptyStateProps extends React.HTMLAttributes<HTMLParagraphElement> {
  /** Vertical padding class — defaults to `py-6`; existing pages use `py-8` / `py-10` / `py-12` too. */
  padding?: string;
}

/**
 * Text-only empty state: `py-6 text-center text-sm text-slate-400`.
 * Override padding/typography via `padding` or `className` (merged with tailwind-merge).
 */
export function EmptyState({ padding = "py-6", className, ...props }: EmptyStateProps) {
  return <p className={cn("text-center text-sm text-slate-400", padding, className)} {...props} />;
}

export interface EmptyStateRowProps {
  colSpan: number;
  className?: string;
  children?: React.ReactNode;
}

/** Table-row empty state: `<TableRow><TableCell colSpan py-12 text-center text-slate-400>`. */
export function EmptyStateRow({ colSpan, className, children }: EmptyStateRowProps) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className={cn("py-12 text-center text-slate-400", className)}>
        {children}
      </TableCell>
    </TableRow>
  );
}
