import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LoadingStateProps {
  label?: string;
  className?: string;
}

/** Simple spinner row for loading panels. */
export function LoadingState({ label = "Loading…", className }: LoadingStateProps) {
  return (
    <div className={cn("flex items-center justify-center gap-2 py-6 text-sm text-slate-400", className)}>
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </div>
  );
}
