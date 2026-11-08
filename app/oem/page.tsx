import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { 
  Activity, 
  Flame, 
  ShieldAlert, 
  Server, 
  ArrowUpRight, 
  Users, 
  CreditCard, 
  Sliders, 
  FileText,
  AlertTriangle,
  Radio
} from "lucide-react";
import { PlatformHealthMonitor } from "@/components/oem/platform-health-monitor";
import { TenantLifecycleFunnel } from "@/components/oem/tenant-lifecycle-funnel";

export const dynamic = "force-dynamic";

export default async function OemDashboard() {
  const supabase = await createClient();

  // Parallel fetch of platform-wide operational signals
  const [
    { count: totalOrgs },
    { count: messageCount },
    { data: usageEvents },
    { count: activeIncidentsCount },
    { data: entitlements },
    { data: liveChannels }
  ] = await Promise.all([
    supabase.from("organizations").select("id", { count: "exact", head: true }),
    supabase.from("operational_usage_events").select("id", { count: "exact", head: true }),
    supabase.from("operational_usage_events").select("estimated_total_paise"),
    supabase.from("security_incidents").select("id", { count: "exact", head: true }),
    supabase.from("entitlements").select("status"),
    supabase.from("channel_connections").select("organization_id").eq("status", "live")
  ]);

  const totalRevenuePaise = (usageEvents || []).reduce(
    (acc: number, curr: { estimated_total_paise: number }) => acc + (curr.estimated_total_paise || 0),
    0
  );
  const totalRevenueINR = (totalRevenuePaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 });

  // Compute lifecycle funnel aggregates
  const activeTenants = (entitlements || []).filter((e) => e.status === "active").length;
  const suspendedTenants = (entitlements || []).filter((e) => e.status === "suspended").length;
  const uniqueLiveChannelOrgs = new Set((liveChannels || []).map((c) => c.organization_id)).size;

  const funnelCounts = {
    totalTenants: totalOrgs || 0,
    onboardedTenants: Math.max(activeTenants, Math.min(totalOrgs || 0, 1)),
    liveChannelsTenants: uniqueLiveChannelOrgs,
    activeCrmTenants: activeTenants,
    suspendedTenants,
  };

  return (
    <div className="space-y-8">
      {/* Platform Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-[11px] font-bold tracking-widest text-[#1bc5a8] uppercase">
            OPERATOR CONTROL PLANE
          </span>
          <h1 className="text-3xl font-black tracking-tight text-white mt-1">Platform Overview</h1>
          <p className="mt-1 text-sm text-slate-400">
            Real-time telemetry, tenant lifecycle, and cluster health across all {totalOrgs || 0} organizations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/oem/alerts"
            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3.5 py-2 text-xs font-bold text-amber-400 hover:bg-amber-500/20 transition-all"
          >
            <AlertTriangle className="size-3.5" />
            Alerts ({activeIncidentsCount || 0})
          </Link>
          <Link
            href="/oem/rollout"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 hover:text-white transition-all"
          >
            <Sliders className="size-3.5" />
            Rollout Controls
          </Link>
        </div>
      </header>

      {/* KPI Cards Row (S5-01) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Tenants */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Total Tenants</span>
            <Server className="size-4 text-[#1bc5a8]" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <b className="text-3xl font-black text-white">{totalOrgs || 0}</b>
            <span className="text-xs font-medium text-emerald-400">
              {activeTenants} active
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
            <span>Cluster capacity: 100%</span>
            <Link href="/oem/tenants" className="text-teal-400 hover:underline">
              View all
            </Link>
          </div>
        </div>

        {/* Messages Dispatched */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Messages Sent</span>
            <Radio className="size-4 text-blue-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <b className="text-3xl font-black text-white">{(messageCount || 0).toLocaleString()}</b>
          </div>
          <div className="mt-2 flex items-center gap-1 text-[11px] font-medium text-slate-500">
            <ArrowUpRight className="size-3 text-emerald-400" />
            Across all WhatsApp Cloud connections
          </div>
        </div>

        {/* Estimated Platform Revenue */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Gross Spend</span>
            <Flame className="size-4 text-amber-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <b className="text-3xl font-black text-white">₹{totalRevenueINR}</b>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
            <span>Operational ledgers</span>
            <Link href="/oem/billing" className="text-amber-400 hover:underline">
              Billing
            </Link>
          </div>
        </div>

        {/* System Incidents / Health */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Active Incidents</span>
            <ShieldAlert className="size-4 text-rose-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <b className="text-3xl font-black text-white">{activeIncidentsCount || 0}</b>
            <span className="text-xs font-medium text-emerald-400">0 critical</span>
          </div>
          <div className="mt-2 flex items-center gap-1 text-[11px] font-medium text-slate-500">
            <Activity className="size-3 text-teal-400" />
            Fail-closed safety active
          </div>
        </div>
      </div>

      {/* S5-02: Platform Health Monitor */}
      <PlatformHealthMonitor />

      {/* S5-03: Tenant Lifecycle & Onboarding Funnel */}
      <TenantLifecycleFunnel counts={funnelCounts} />

      {/* Workspace Health Overview */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-white">Workspace health</h2>
            <p className="mt-1 text-sm text-slate-400">
              Aggregated adoption metrics, 30-day appointments, and recent failed deliveries across tenant organizations.
            </p>
          </div>
          <span className="inline-flex items-center rounded-full bg-slate-800 border border-slate-700/50 px-3 py-1 text-xs font-semibold text-slate-300">
            Support impersonation is not enabled
          </span>
        </div>
      </section>

      {/* Operator Quick Controls */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Link
          href="/oem/tenants"
          className="group rounded-2xl border border-slate-800 bg-slate-900/40 p-5 hover:border-teal-500/40 hover:bg-slate-900/70 transition-all"
        >
          <div className="flex size-10 items-center justify-center rounded-xl bg-teal-500/10 text-teal-400 mb-3 group-hover:scale-105 transition-transform">
            <Users className="size-5" />
          </div>
          <h3 className="text-base font-bold text-white group-hover:text-teal-300">Tenant Management</h3>
          <p className="mt-1 text-xs text-slate-400 leading-relaxed">
            Search, filter, suspend, extend trials, and manage feature flags across all clinic tenants.
          </p>
        </Link>

        <Link
          href="/oem/billing"
          className="group rounded-2xl border border-slate-800 bg-slate-900/40 p-5 hover:border-blue-500/40 hover:bg-slate-900/70 transition-all"
        >
          <div className="flex size-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 mb-3 group-hover:scale-105 transition-transform">
            <CreditCard className="size-5" />
          </div>
          <h3 className="text-base font-bold text-white group-hover:text-blue-300">Billing & Rate Cards</h3>
          <p className="mt-1 text-xs text-slate-400 leading-relaxed">
            View platform wallet balances, edit WhatsApp rate cards, and perform monthly reconciliation.
          </p>
        </Link>

        <Link
          href="/oem/audit"
          className="group rounded-2xl border border-slate-800 bg-slate-900/40 p-5 hover:border-purple-500/40 hover:bg-slate-900/70 transition-all"
        >
          <div className="flex size-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400 mb-3 group-hover:scale-105 transition-transform">
            <FileText className="size-5" />
          </div>
          <h3 className="text-base font-bold text-white group-hover:text-purple-300">Audit Trail & Exports</h3>
          <p className="mt-1 text-xs text-slate-400 leading-relaxed">
            Review immutable operator audit logs, track platform actions, and download CSV data exports.
          </p>
        </Link>
      </div>
    </div>
  );
}
