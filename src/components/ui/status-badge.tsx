import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

type BadgeVariant = "default" | "secondary" | "destructive" | "success" | "warning" | "ai" | "outline";

/**
 * Central status → badge-variant registry. Replaces the per-page maps
 * (statusBadge, invoiceStatusBadge, claimStatusBadge, priorityBadge, integration health).
 * Unknown statuses fall back to `secondary`.
 */
const STATUS_REGISTRY: Record<string, { variant: BadgeVariant; label?: string }> = {
  // Equipment / queue health
  operational: { variant: "success" },
  maintenance: { variant: "warning" },
  offline: { variant: "destructive" },
  // Appointments / workflow stages
  completed: { variant: "success" },
  in_progress: { variant: "default" },
  checked_in: { variant: "warning" },
  scheduled: { variant: "secondary" },
  // Reports
  signed: { variant: "success" },
  pending_review: { variant: "warning" },
  draft: { variant: "secondary" },
  // Invoices
  paid: { variant: "success" },
  partial: { variant: "warning" },
  sent: { variant: "default" },
  overdue: { variant: "destructive" },
  written_off: { variant: "secondary" },
  // Insurance claims
  approved: { variant: "success" },
  partially_approved: { variant: "warning" },
  pending: { variant: "warning" },
  submitted: { variant: "default" },
  rejected: { variant: "destructive" },
  // AI review observations
  accepted: { variant: "success" },
  // Registry records (patients, branches, employees, tariffs)
  active: { variant: "success" },
  // Priorities
  stat: { variant: "destructive", label: "STAT" },
  urgent: { variant: "warning", label: "Urgent" },
  routine: { variant: "secondary", label: "Routine" },
  // Integration health
  connected: { variant: "success", label: "Connected" },
  unreachable: { variant: "destructive", label: "Unreachable" },
  not_configured: { variant: "secondary", label: "Not Configured" },
};

export interface StatusBadgeProps {
  status: string;
  /** Explicit label; defaults to the registry label, then the status with underscores replaced. */
  label?: ReactNode;
  className?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const entry = STATUS_REGISTRY[status];
  return (
    <Badge variant={entry?.variant ?? "secondary"} className={className}>
      {label ?? entry?.label ?? status.replace(/_/g, " ")}
    </Badge>
  );
}

/** Priority badge — identical ternary previously duplicated in reception, scheduling and workflow. */
export function PriorityBadge({ priority }: { priority: string }) {
  if (priority === "stat") return <Badge variant="destructive">STAT</Badge>;
  if (priority === "urgent") return <Badge variant="warning">Urgent</Badge>;
  return <Badge variant="secondary">Routine</Badge>;
}
