import { createClient } from "@/lib/supabase/server";
import { CreditCard, Flame, AlertCircle, Download } from "lucide-react";
import { RateCardManager, RateCardItem } from "@/components/oem/rate-card-manager";
import { ReconciliationDashboard } from "@/components/oem/reconciliation-dashboard";

export const dynamic = "force-dynamic";

export default async function OemBillingPage() {
  const supabase = await createClient();

  const [
    { data: wallets },
    { data: orgs },
    { data: usageEvents },
    { data: rateCards }
  ] = await Promise.all([
    supabase.schema("billing").from("tenant_wallets").select("organization_id, balance_paise, warning_threshold_paise"),
    supabase.from("organizations").select("id, name, extra"),
    supabase.from("operational_usage_events").select("estimated_total_paise"),
    supabase.from("whatsapp_rate_cards").select("id, channel, country_code, message_category, base_rate_paise, platform_fee_paise, active, verification_status")
  ]);

  const orgMap = new Map((orgs || []).map((o) => [o.id, o.name]));

  const totalRevenuePaise = (usageEvents || []).reduce(
    (acc: number, curr: { estimated_total_paise: number }) => acc + (curr.estimated_total_paise || 0),
    0
  );
  const totalRevenueINR = (totalRevenuePaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 });

  const totalWalletBalancesPaise = (wallets || []).reduce(
    (acc: number, w: { balance_paise: number }) => acc + (Number(w.balance_paise) || 0),
    0
  );
  const totalWalletBalancesINR = (totalWalletBalancesPaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 });

  const lowBalanceCount = (wallets || []).filter(
    (w) => Number(w.balance_paise) < Number(w.warning_threshold_paise || 5000)
  ).length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="text-[11px] font-bold tracking-widest text-[#1bc5a8] uppercase">
            FINANCIAL OPERATIONS
          </span>
          <h1 className="text-3xl font-black tracking-tight text-white mt-1">Platform Billing & Ledgers</h1>
          <p className="mt-1 text-sm text-slate-400">
            Global operational spend, prepaid wallet balances, rate card management, and Meta Cloud reconciliation.
          </p>
        </div>
        <a
          href="/api/oem/export?type=billing"
          download
          className="inline-flex items-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 transition-colors self-start sm:self-auto"
        >
          <Download className="size-3.5 text-teal-400" />
          Export Billing CSV
        </a>
      </header>

      {/* KPI Cards Row (S5-08) */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase">
            <span>Gross Platform Usage</span>
            <Flame className="size-4 text-amber-400" />
          </div>
          <div className="mt-3 text-3xl font-black text-white">₹{totalRevenueINR}</div>
          <p className="mt-1 text-xs text-slate-500">Across all WhatsApp Cloud dispatches</p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase">
            <span>Prepaid Float Balance</span>
            <CreditCard className="size-4 text-teal-400" />
          </div>
          <div className="mt-3 text-3xl font-black text-white">₹{totalWalletBalancesINR}</div>
          <p className="mt-1 text-xs text-slate-500">Held in tenant wallets</p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase">
            <span>Low Balance Alerts</span>
            <AlertCircle className="size-4 text-rose-400" />
          </div>
          <div className="mt-3 text-3xl font-black text-white">{lowBalanceCount}</div>
          <p className="mt-1 text-xs text-slate-500">Wallets below warning threshold</p>
        </div>
      </div>

      {/* Per-Tenant Wallet Breakdown */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 space-y-4">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-base font-bold text-white">Tenant Prepaid Wallets</h2>
            <p className="mt-1 text-xs text-slate-400">
              Live balances and automated warning thresholds for each tenant clinic.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-800 bg-slate-950/40 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-4 py-3">Clinic Organization</th>
                <th className="px-4 py-3 text-right">Balance</th>
                <th className="px-4 py-3 text-right">Warning Threshold</th>
                <th className="px-4 py-3 text-right">Wallet Health</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {(wallets || []).map((w) => {
                const balancePaise = Number(w.balance_paise) || 0;
                const thresholdPaise = Number(w.warning_threshold_paise) || 5000;
                const isLow = balancePaise < thresholdPaise;
                const clinicName = orgMap.get(w.organization_id) || "Demo Clinic";

                return (
                  <tr key={w.organization_id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3.5">
                      <b className="text-slate-100">{clinicName}</b>
                      <span className="text-[11px] text-slate-500 block">ID: {w.organization_id.slice(0, 8)}...</span>
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono font-bold text-white">
                      ₹{(balancePaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-slate-400">
                      ₹{(thresholdPaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                          isLow
                            ? "bg-rose-500/10 text-rose-400 ring-1 ring-inset ring-rose-500/20"
                            : "bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/20"
                        }`}
                      >
                        {isLow ? "Needs Top-Up" : "Healthy"}
                      </span>
                    </td>
                  </tr>
                );
              })}

              {(!wallets || wallets.length === 0) && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500 text-xs">
                    No active prepaid wallets recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* S5-09: WhatsApp Rate Card Manager */}
      <RateCardManager initialRateCards={rateCards as RateCardItem[] | undefined} />

      {/* S5-10: Monthly Reconciliation Dashboard */}
      <ReconciliationDashboard />
    </div>
  );
}
