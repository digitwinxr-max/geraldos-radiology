import { cn } from "@/lib/utils";

export interface UtilizationBarProps {
  value: number;
  /** Returns the fill colour class for the given value — threshold schemes stay page-owned. */
  colorFor?: (value: number) => string;
  /** Adds the `transition-all duration-700` sweep used by the command centre. */
  animated?: boolean;
  /** Track overrides — e.g. `mt-1 dark:bg-slate-800` (dashboard) or `w-16` (equipment table). */
  className?: string;
}

/**
 * Progress bar: `h-2 overflow-hidden rounded-full bg-slate-100` track with a coloured fill.
 * The fill width is clamped to 100%.
 */
export function UtilizationBar({ value, colorFor, animated = false, className }: UtilizationBarProps) {
  return (
    <div className={cn("h-2 overflow-hidden rounded-full bg-slate-100", className)}>
      <div
        className={cn("h-full rounded-full", animated && "transition-all duration-700", colorFor?.(value))}
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </div>
  );
}
