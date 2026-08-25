import type { ReactNode } from "react";

export interface FormFieldProps {
  label: string;
  /** Renders the literal ` *` marker after the label, matching the required control. */
  required?: boolean;
  /** Wrapper classes — e.g. `col-span-2` for grid forms. */
  className?: string;
  children: ReactNode;
}

/**
 * Label + control wrapper used across every dialog form:
 * `<div><label className="mb-1 block text-sm font-medium text-slate-700">…</label>{control}</div>`.
 * Children (Input/Select) render unchanged.
 */
export function FormField({ label, required = false, className, children }: FormFieldProps) {
  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required ? " *" : ""}
      </label>
      {children}
    </div>
  );
}
