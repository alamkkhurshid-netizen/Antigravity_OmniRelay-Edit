import * as React from "react";
import { Badge } from "./badge";

export type StatusType =
  | "active"
  | "completed"
  | "success"
  | "pending"
  | "warning"
  | "in_progress"
  | "cancelled"
  | "failed"
  | "urgent"
  | "draft"
  | "archived";

export interface StatusBadgeProps {
  status: StatusType | string;
  label?: string;
  className?: string;
}

export function StatusBadge({ status, label, className = "" }: StatusBadgeProps) {
  const normalized = status.toLowerCase().replace(/[\s-]/g, "_");

  const config: Record<
    string,
    { label: string; variant: "default" | "secondary" | "destructive" | "outline"; dotClass: string }
  > = {
    active: { label: "Active", variant: "default", dotClass: "bg-emerald-400" },
    completed: { label: "Completed", variant: "secondary", dotClass: "bg-emerald-500" },
    success: { label: "Success", variant: "default", dotClass: "bg-emerald-500" },
    pending: { label: "Pending", variant: "secondary", dotClass: "bg-amber-400" },
    warning: { label: "Warning", variant: "secondary", dotClass: "bg-amber-500" },
    in_progress: { label: "In Progress", variant: "secondary", dotClass: "bg-sky-400 animate-pulse" },
    cancelled: { label: "Cancelled", variant: "outline", dotClass: "bg-zinc-400" },
    failed: { label: "Failed", variant: "destructive", dotClass: "bg-rose-500" },
    urgent: { label: "Urgent", variant: "destructive", dotClass: "bg-rose-500 animate-pulse" },
    draft: { label: "Draft", variant: "outline", dotClass: "bg-zinc-400" },
    archived: { label: "Archived", variant: "outline", dotClass: "bg-zinc-500" },
  };

  const current = config[normalized] || {
    label: label || status,
    variant: "outline" as const,
    dotClass: "bg-zinc-400",
  };

  return (
    <Badge
      variant={current.variant}
      className={`inline-flex items-center gap-1.5 capitalize font-medium ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${current.dotClass}`} />
      {label || current.label}
    </Badge>
  );
}
