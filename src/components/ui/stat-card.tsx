import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface StatCardProps {
  icon: LucideIcon;
  value: React.ReactNode;
  label: React.ReactNode;
  /**
   * Icon colour class first, tile background classes after —
   * e.g. `"text-brand bg-brand-soft"` (same convention as the command-centre KPI grid).
   */
  tone: string;
  /** `lg` = full stat tile (p-6, h-12 tile, text-2xl value); `kpi` = compact dashboard tile. */
  size?: "lg" | "kpi";
  className?: string;
}

export function StatCard({ icon: Icon, value, label, tone, size = "lg", className }: StatCardProps) {
  const [iconClass, ...tileClasses] = tone.split(" ");
  const tile = tileClasses.join(" ");

  if (size === "kpi") {
    return (
      <Card className={cn("overflow-hidden", className)}>
        <CardContent className="p-4">
          <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", tile)}>
            <Icon className={cn("h-4 w-4", iconClass)} />
          </div>
          <p className="mt-3 truncate text-xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">{label}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardContent className="flex items-center gap-4 p-6">
        <div className={cn("flex h-12 w-12 items-center justify-center rounded-lg", tile)}>
          <Icon className={cn("h-6 w-6", iconClass)} />
        </div>
        <div>
          <p className="text-2xl font-bold text-slate-900">{value}</p>
          <p className="text-sm text-slate-500">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
