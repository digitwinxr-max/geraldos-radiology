import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-brand-soft text-brand-text",
        secondary: "border-transparent bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300",
        destructive: "border-transparent bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
        success: "border-transparent bg-operational-soft text-operational-text",
        warning: "border-transparent bg-premium-soft text-premium-text",
        ai: "border-transparent bg-ai-soft text-ai-text",
        outline: "text-slate-700 border-slate-300 dark:text-slate-300 dark:border-slate-600",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
