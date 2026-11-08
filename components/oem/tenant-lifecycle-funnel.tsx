"use client";

import React from "react";
import Link from "next/link";
import { Users, UserCheck, Radio, Activity, AlertCircle, ArrowRight } from "lucide-react";

export interface FunnelCounts {
  totalTenants: number;
  onboardedTenants: number;
  liveChannelsTenants: number;
  activeCrmTenants: number;
  suspendedTenants: number;
}

export function TenantLifecycleFunnel({ counts }: { counts: FunnelCounts }) {
  const total = counts.totalTenants || 1;
  const onboardedPct = Math.round((counts.onboardedTenants / total) * 100);
  const livePct = Math.round((counts.liveChannelsTenants / total) * 100);
  const activePct = Math.round((counts.activeCrmTenants / total) * 100);

  const stages = [
    {
      label: "Total Registered",
      count: counts.totalTenants,
      pct: 100,
      icon: Users,
      color: "bg-blue-500",
      textColor: "text-blue-400",
      filterUrl: "/oem/tenants?filter=all",
      desc: "All organizations created",
    },
    {
      label: "Onboarded Clinics",
      count: counts.onboardedTenants,
      pct: onboardedPct,
      icon: UserCheck,
      color: "bg-teal-500",
      textColor: "text-teal-400",
      filterUrl: "/oem/tenants?filter=onboarded",
      desc: "Profile & safeguards completed",
    },
    {
      label: "Live Channels",
      count: counts.liveChannelsTenants,
      pct: livePct,
      icon: Radio,
      color: "bg-indigo-500",
      textColor: "text-indigo-400",
      filterUrl: "/oem/tenants?filter=live_channel",
      desc: "WhatsApp number connected",
    },
    {
      label: "Active CRM",
      count: counts.activeCrmTenants,
      pct: activePct,
      icon: Activity,
      color: "bg-emerald-500",
      textColor: "text-emerald-400",
      filterUrl: "/oem/tenants?filter=active",
      desc: "Appointments & messages 30d",
    },
    {
      label: "Suspended / Attention",
      count: counts.suspendedTenants,
      pct: Math.round((counts.suspendedTenants / total) * 100),
      icon: AlertCircle,
      color: "bg-amber-500",
      textColor: "text-amber-400",
      filterUrl: "/oem/tenants?filter=suspended",
      desc: "Policy holds or trial ended",
    },
  ];

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800">
        <div>
          <h2 className="text-base font-bold text-white">Tenant Lifecycle & Onboarding Funnel</h2>
          <p className="mt-1 text-xs text-slate-400">
            Conversion metrics from initial signup through live clinic deployment and CRM retention.
          </p>
        </div>
        <Link
          href="/oem/tenants"
          className="inline-flex items-center gap-1 text-xs font-semibold text-teal-400 hover:text-teal-300 transition-colors"
        >
          View All Tenants <ArrowRight className="size-3.5" />
        </Link>
      </div>

      <div className="grid gap-4 mt-6 sm:grid-cols-5">
        {stages.map((stage) => {
          const Icon = stage.icon;
          return (
            <Link
              key={stage.label}
              href={stage.filterUrl}
              className="group flex flex-col justify-between rounded-xl border border-slate-800/80 bg-slate-950/40 p-4 transition-all hover:border-slate-700 hover:bg-slate-900/80"
            >
              <div>
                <div className="flex items-center justify-between text-slate-400 mb-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider">{stage.label}</span>
                  <Icon className={`size-4 ${stage.textColor}`} />
                </div>
                <div className="text-2xl font-black text-white">{stage.count}</div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div className={`h-full rounded-full ${stage.color}`} style={{ width: `${stage.pct}%` }} />
                  </div>
                  <span className="text-[10px] font-bold text-slate-400">{stage.pct}%</span>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-slate-500 leading-tight group-hover:text-slate-400">
                {stage.desc}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
