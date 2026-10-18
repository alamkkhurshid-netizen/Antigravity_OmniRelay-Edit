"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { 
  Search, 
  Download, 
  Eye, 
  PowerOff, 
  CheckCircle, 
  UserCheck,
  Building2,
  Calendar
} from "lucide-react";
import { 
  suspendTenant, 
  reactivateTenant, 
  extendTenantTrial, 
  toggleSupportImpersonation 
} from "@/app/oem/tenants/actions";
import { TenantFeaturesCell } from "@/app/oem/tenants/tenant-features-cell";

export interface TenantRow {
  organization_id: string;
  organization_name: string;
  business_category: string;
  created_at: string;
  plan_id: string;
  status: string;
  total_messages: number;
  estimated_revenue_paise: number;
  features?: {
    google_calendar_sync?: boolean;
    premium_support_agent_active?: boolean;
    premium_growth_agent_active?: boolean;
    premium_cto_agent_active?: boolean;
    premium_admin_agent_active?: boolean;
  };
}

export function TenantDirectory({ initialTenants }: { initialTenants: TenantRow[] }) {
  const [tenants, setTenants] = useState<TenantRow[]>(initialTenants);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"name" | "revenue" | "messages" | "date">("date");
  const [busyOrgId, setBusyOrgId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const filteredTenants = useMemo(() => {
    return tenants
      .filter((t) => {
        const matchesSearch =
          t.organization_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.business_category?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.organization_id.includes(searchQuery);

        const matchesStatus =
          statusFilter === "all" ||
          (statusFilter === "active" && t.status === "active") ||
          (statusFilter === "trialing" && (t.status === "trialing" || !t.status)) ||
          (statusFilter === "suspended" && t.status === "suspended");

        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => {
        if (sortBy === "revenue") return (b.estimated_revenue_paise || 0) - (a.estimated_revenue_paise || 0);
        if (sortBy === "messages") return (b.total_messages || 0) - (a.total_messages || 0);
        if (sortBy === "name") return a.organization_name.localeCompare(b.organization_name);
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [tenants, searchQuery, statusFilter, sortBy]);

  async function handleToggleSuspend(tenant: TenantRow) {
    const isSuspended = tenant.status === "suspended";
    const confirmMsg = isSuspended
      ? `Reactivate workspace for "${tenant.organization_name}"?`
      : `Are you sure you want to SUSPEND "${tenant.organization_name}"? This will pause all outbound messaging and concierge booking.`;

    if (!confirm(confirmMsg)) return;

    setBusyOrgId(tenant.organization_id);
    setActionNotice(null);

    try {
      if (isSuspended) {
        await reactivateTenant(tenant.organization_id);
        setTenants((prev) =>
          prev.map((t) => (t.organization_id === tenant.organization_id ? { ...t, status: "active" } : t))
        );
        setActionNotice(`Reactivated ${tenant.organization_name}`);
      } else {
        await suspendTenant(tenant.organization_id, "Operator administrative hold");
        setTenants((prev) =>
          prev.map((t) => (t.organization_id === tenant.organization_id ? { ...t, status: "suspended" } : t))
        );
        setActionNotice(`Suspended ${tenant.organization_name}`);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusyOrgId(null);
    }
  }

  async function handleExtendTrial(tenant: TenantRow) {
    const daysStr = prompt(`Extend trial for "${tenant.organization_name}" by how many days?`, "14");
    if (!daysStr) return;
    const days = parseInt(daysStr, 10);
    if (isNaN(days) || days <= 0) return;

    setBusyOrgId(tenant.organization_id);
    try {
      const res = await extendTenantTrial(tenant.organization_id, days);
      if (res.success) {
        setTenants((prev) =>
          prev.map((t) => (t.organization_id === tenant.organization_id ? { ...t, status: "trialing" } : t))
        );
        setActionNotice(`Extended trial for ${tenant.organization_name} by ${days} days`);
      }
    } finally {
      setBusyOrgId(null);
    }
  }

  async function handleImpersonate(tenant: TenantRow) {
    if (!confirm(`Launch support impersonation mode for "${tenant.organization_name}"? You will view their workspace in read-only mode.`)) return;
    setBusyOrgId(tenant.organization_id);
    try {
      await toggleSupportImpersonation(tenant.organization_id, true);
      window.location.assign("/app");
    } finally {
      setBusyOrgId(null);
    }
  }

  function exportCsv() {
    const headers = ["Organization ID", "Name", "Category", "Plan", "Status", "Messages", "Estimated Spend (INR)", "Created Date"];
    const rows = filteredTenants.map((t) => [
      `"${t.organization_id}"`,
      `"${t.organization_name.replace(/"/g, '""')}"`,
      `"${t.business_category || 'Healthcare'}"`,
      `"${t.plan_id || 'Standard'}"`,
      `"${t.status || 'trialing'}"`,
      t.total_messages || 0,
      ((t.estimated_revenue_paise || 0) / 100).toFixed(2),
      `"${new Date(t.created_at).toISOString().split('T')[0]}"`,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `omnirelay_tenants_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="space-y-6">
      {/* Notice Banner */}
      {actionNotice && (
        <div className="flex items-center justify-between rounded-xl border border-teal-500/20 bg-teal-500/10 px-4 py-3 text-xs font-semibold text-teal-300">
          <span>{actionNotice}</span>
          <button onClick={() => setActionNotice(null)} className="text-teal-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Control Bar: Search, Filters, Sort, CSV Export */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search clinic name, category, or ID..."
              className="w-full rounded-xl border border-slate-700 bg-slate-900/60 py-2.5 pl-10 pr-4 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-400 transition-all"
            />
          </div>

          {/* Status Filter Tabs */}
          <div className="flex rounded-xl border border-slate-800 bg-slate-900/60 p-1">
            {["all", "active", "trialing", "suspended"].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`rounded-lg px-3 py-1 text-xs font-bold capitalize transition-all ${
                  statusFilter === st
                    ? "bg-teal-500/20 text-teal-300 border border-teal-500/30"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "name" | "revenue" | "messages" | "date")}
            className="rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs font-semibold text-slate-200 focus:outline-none focus:border-teal-400"
          >
            <option value="date">Sort: Newest</option>
            <option value="revenue">Sort: Highest Revenue</option>
            <option value="messages">Sort: Most Messages</option>
            <option value="name">Sort: Clinic Name</option>
          </select>

          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 hover:text-white transition-all shadow-sm"
          >
            <Download className="size-3.5 text-teal-400" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Tenants Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-6 py-4">Clinic Organization</th>
                <th className="px-4 py-4">Plan & Status</th>
                <th className="px-4 py-4">Feature Toggles</th>
                <th className="px-4 py-4 text-center">Messages</th>
                <th className="px-4 py-4 text-right">Est. Spend</th>
                <th className="px-6 py-4 text-right">Lifecycle Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredTenants.map((t) => {
                const isSuspended = t.status === "suspended";
                const isBusy = busyOrgId === t.organization_id;

                return (
                  <tr key={t.organization_id} className="hover:bg-slate-800/30 transition-colors">
                    {/* Organization info */}
                    <td className="px-6 py-4">
                      <div className="flex items-start gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-800 border border-slate-700 text-teal-400">
                          <Building2 className="size-4" />
                        </div>
                        <div>
                          <Link
                            href={`/oem/tenants/${t.organization_id}`}
                            className="font-bold text-white hover:text-teal-300 transition-colors block"
                          >
                            {t.organization_name}
                          </Link>
                          <span className="text-xs text-slate-400 block mt-0.5">
                            {t.business_category || "Healthcare"} · ID: {t.organization_id.slice(0, 8)}...
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Plan & Status */}
                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-1">
                        <span className="inline-flex w-fit items-center rounded-md bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-400 ring-1 ring-inset ring-blue-500/20">
                          {t.plan_id || "Standard"}
                        </span>
                        <span
                          className={`text-xs font-semibold ${
                            isSuspended
                              ? "text-rose-400"
                              : t.status === "active"
                              ? "text-emerald-400"
                              : "text-amber-400"
                          }`}
                        >
                          {t.status || "trialing"}
                        </span>
                      </div>
                    </td>

                    {/* Features */}
                    <td className="px-4 py-4">
                      <TenantFeaturesCell
                        organizationId={t.organization_id}
                        initialGoogleSync={!!t.features?.google_calendar_sync}
                        initialSupportAgent={!!t.features?.premium_support_agent_active}
                        initialCtoAgent={!!t.features?.premium_cto_agent_active}
                        initialGrowthAgent={!!t.features?.premium_growth_agent_active}
                        initialAdminAgent={!!t.features?.premium_admin_agent_active}
                      />
                    </td>

                    {/* Messages count */}
                    <td className="px-4 py-4 text-center font-medium text-slate-300">
                      {(t.total_messages || 0).toLocaleString()}
                    </td>

                    {/* Spend */}
                    <td className="px-4 py-4 text-right font-bold text-slate-100">
                      ₹{((t.estimated_revenue_paise || 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-1.5 justify-end">
                        <Link
                          href={`/oem/tenants/${t.organization_id}`}
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-all"
                          title="View Tenant Detail"
                        >
                          <Eye className="size-4" />
                        </Link>

                        <button
                          onClick={() => handleExtendTrial(t)}
                          disabled={isBusy}
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-amber-400 transition-all"
                          title="Extend Trial"
                        >
                          <Calendar className="size-4" />
                        </button>

                        <button
                          onClick={() => handleImpersonate(t)}
                          disabled={isBusy}
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-blue-400 transition-all"
                          title="Support Impersonation (Read-only)"
                        >
                          <UserCheck className="size-4" />
                        </button>

                        <button
                          onClick={() => handleToggleSuspend(t)}
                          disabled={isBusy}
                          className={`rounded-lg p-2 transition-all ${
                            isSuspended
                              ? "text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
                              : "text-slate-400 hover:bg-rose-500/10 hover:text-rose-400"
                          }`}
                          title={isSuspended ? "Reactivate Organization" : "Suspend Organization"}
                        >
                          {isSuspended ? <CheckCircle className="size-4" /> : <PowerOff className="size-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredTenants.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    No tenant clinics match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
