import { createClient } from "@/lib/supabase/server";
import { Activity, Flame, ShieldAlert, Server, ArrowUpRight } from "lucide-react";

export default async function OemDashboard() {
  const supabase = await createClient();

  // Fetch macro KPIs across all tenants via RPC or direct query since we have RLS policies for platform_operators
  const [{ count: orgCount }, { count: messageCount }, { data: usageEvents }] = await Promise.all([
    supabase.from("organizations").select("id", { count: "exact", head: true }),
    supabase.from("operational_usage_events").select("id", { count: "exact", head: true }),
    supabase.from("operational_usage_events").select("estimated_total_paise")
  ]);

  const totalRevenuePaise = (usageEvents || []).reduce((acc: number, curr: { estimated_total_paise: number }) => acc + (curr.estimated_total_paise || 0), 0);
  const totalRevenueINR = (totalRevenuePaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-white">Platform Overview</h1>
        <p className="mt-1 text-sm text-slate-400">Global metrics across all {orgCount || 0} tenants.</p>
      </header>

      {/* KPI Row */}
      <div className="grid gap-4 md:grid-cols-4">
        <article className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Total Tenants</span>
            <Server className="size-4 text-[#1bc5a8]" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <b className="text-3xl font-extrabold text-white">{orgCount || 0}</b>
          </div>
          <span className="mt-1 flex items-center gap-1 text-[10px] font-medium text-[#1bc5a8]">
            <ArrowUpRight className="size-3" />
            Active cluster
          </span>
        </article>

        <article className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Messages Sent</span>
            <Activity className="size-4 text-blue-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <b className="text-3xl font-extrabold text-white">{messageCount || 0}</b>
          </div>
          <span className="mt-1 flex items-center gap-1 text-[10px] font-medium text-slate-500">
            Across all WhatsApp connections
          </span>
        </article>

        <article className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 md:col-span-2 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-[#1bc5a8]/10 to-transparent"></div>
          <div className="relative">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-bold uppercase tracking-wider">Estimated Gross Revenue</span>
              <Flame className="size-4 text-amber-400" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <b className="text-3xl font-extrabold text-white">₹{totalRevenueINR}</b>
            </div>
            <span className="mt-1 flex items-center gap-1 text-[10px] font-medium text-[#1bc5a8]">
              Based on active shadow ledgers & rate cards
            </span>
          </div>
        </article>
      </div>

      {/* Emergency Controls */}
      <section className="mt-8 rounded-xl border border-rose-900/50 bg-rose-950/20 p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-full bg-rose-900/50 p-2">
            <ShieldAlert className="size-5 text-rose-500" />
          </div>
          <div>
            <h2 className="text-base font-bold text-rose-100">Global Cluster Controls</h2>
            <p className="mt-1 text-sm text-rose-300/70">
              Emergency actions to halt operations across all tenants. Use only during severe upstream Meta API outages.
            </p>
            <div className="mt-4 flex gap-3">
              <button disabled className="rounded-lg bg-rose-900/50 px-4 py-2 text-xs font-bold text-rose-200 transition-colors hover:bg-rose-800 opacity-50 cursor-not-allowed">
                Halt All Outbound Messages
              </button>
              <button disabled className="rounded-lg border border-rose-900/50 bg-transparent px-4 py-2 text-xs font-bold text-rose-200 transition-colors hover:bg-rose-900/30 opacity-50 cursor-not-allowed">
                Suspend Booking Concierge
              </button>
            </div>
            <p className="mt-3 text-[10px] text-rose-400/50 uppercase tracking-widest font-black">
              Requires secondary OEM confirmation to unlock.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
