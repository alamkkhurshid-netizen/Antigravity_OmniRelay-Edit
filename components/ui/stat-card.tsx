import type { ReactNode } from "react";

type StatCardProps = { label: string; value: ReactNode; detail: string; icon?: ReactNode; className?: string; valueClassName?: string };

/** Shared workspace metric card. The numeric value always uses the app stat token. */
export function StatCard({ label, value, detail, icon, className = "", valueClassName = "" }: StatCardProps) {
  return <article className={`or-stat-card ${className}`}><div className="flex items-center justify-between gap-3"><span className="or-type-label text-[#718599]">{label}</span>{icon}</div><b className={`or-type-stat mt-3 block ${valueClassName}`}>{value}</b><small className="mt-2 block text-sm leading-5 text-[#718599]">{detail}</small></article>;
}
