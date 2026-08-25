import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface FormFieldProps {
  label: string;
  /** Renders the literal ` *` marker after the label, matching the required control. */
  required?: boolean;
  /** Wrapper classes — e.g. `col-span-2` for grid forms. */
  className?: string;
  children: ReactNode;
}

/**
 * Label + control wrapper used across every dialog form. The control renders
 * inside the <label> so the association is programmatic (no ids needed); the
 * inner block span reproduces the previous `<label class="mb-1 block ...">`
 * layout exactly, so visual output is unchanged.
 */
export function FormField({ label, required = false, className, children }: FormFieldProps) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required ? " *" : ""}
      </span>
      {children}
    </label>
  );
}
