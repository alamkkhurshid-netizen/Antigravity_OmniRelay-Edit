import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { 
  Building2, 
  ArrowLeft, 
  CreditCard, 
  Radio, 
  Calendar, 
  MapPin
} from "lucide-react";
import { TenantDetailActions } from "./tenant-detail-actions";

export const dynamic = "force-dynamic";

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: organizationId } = await params;
  const supabase = await createClient();

  const [
    { data: org, error: orgError },
    { data: entitlement },
    { data: wallet },
    { data: channels },
    { count: locationsCount },
    { count: providersCount },
    { count: messageCount },
    { count: appointmentCount }
  ] = await Promise.all([
    supabase.from("organizations").select("id, name, created_at, updated_at, extra").eq("id", organizationId).single(),
    supabase.from("entitlements").select("plan_id, status, trial_ends_at, current_period_end, conversations_quota").eq("organization_id", organizationId).maybeSingle(),
    supabase.schema("billing").from("tenant_wallets").select("balance_paise, warning_threshold_paise").eq("organization_id", organizationId).maybeSingle(),
    supabase.from("channel_connections").select("id, channel, status, display_address, display_name").eq("organization_id", organizationId),
    supabase.from("business_locations").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
    supabase.from("booking_resources").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
    supabase.from("operational_usage_events").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
    supabase.from("appointments").select("id", { count: "exact", head: true }).eq("organization_id", organizationId)
  ]);

  if (orgError || !org) {
    notFound();
  }

  const extra = (org.extra || {}) as Record<string, unknown>;
  const isSuspended = entitlement?.status === "suspended";
  const balanceINR = ((wallet?.balance_paise || 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 });
  const thresholdINR = ((wallet?.warning_threshold_paise || 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 });

  return (
    <div className="space-y-8">
      {/* Breadcrumb & Navigation */}
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
        <Link href="/oem/tenants" className="inline-flex items-center gap-1 hover:text-white transition-colors">
          <ArrowLeft className="size-3.5" /> Back to Tenants
        </Link>
        <span>/</span>
        <span className="text-slate-200">{org.name}</span>
      </div>

      {/* Header Banner */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-sm">
        <div className="flex items-start gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-400 shadow-lg shadow-teal-500/5">
            <Building2 className="size-7" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-white">{org.name}</h1>
              <span
                className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${
                  isSuspended
                    ? "bg-rose-500/10 text-rose-400 ring-1 ring-inset ring-rose-500/20"
                    : entitlement?.status === "active"
                    ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/20"
                    : "bg-amber-500/10 text-amber-400 ring-1 ring-inset ring-amber-500/20"
                }`}
              >
                {entitlement?.status || "trialing"}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Org ID: <code className="text-slate-300 font-mono">{org.id}</code> · Category:{" "}
              <b className="text-slate-200">{String(extra.business_category || "Healthcare")}</b> · Created:{" "}
              {new Date(org.created_at).toLocaleDateString("en-IN", { dateStyle: "long" })}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <TenantDetailActions
          organizationId={org.id}
          organizationName={org.name}
          isSuspended={isSuspended}
          trialEndsAt={entitlement?.trial_ends_at}
        />
      </header>

      {/* KPI Grid */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400 uppercase">
            <span>Operational Wallet</span>
            <CreditCard className="size-4 text-teal-400" />
          </div>
          <div className="mt-3 text-2xl font-black text-white">₹{balanceINR}</div>
          <p className="mt-1 text-xs text-slate-500">Threshold: ₹{thresholdINR}</p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400 uppercase">
            <span>Messages Processed</span>
            <Radio className="size-4 text-blue-400" />
          </div>
          <div className="mt-3 text-2xl font-black text-white">{(messageCount || 0).toLocaleString()}</div>
          <p className="mt-1 text-xs text-slate-500">Total ledger events</p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400 uppercase">
            <span>Appointments</span>
            <Calendar className="size-4 text-indigo-400" />
          </div>
          <div className="mt-3 text-2xl font-black text-white">{(appointmentCount || 0).toLocaleString()}</div>
          <p className="mt-1 text-xs text-slate-500">Bookings logged</p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400 uppercase">
            <span>Chambers & Doctors</span>
            <MapPin className="size-4 text-amber-400" />
          </div>
          <div className="mt-3 text-2xl font-black text-white">
            {locationsCount || 0} / {providersCount || 0}
          </div>
          <p className="mt-1 text-xs text-slate-500">Locations / Roster</p>
        </div>
      </div>

      {/* Subscription & Channels Row */}
      <div className="grid gap-6 sm:grid-cols-2">
        {/* Entitlement & Plan */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
          <h2 className="text-base font-bold text-white mb-4">Subscription & Entitlements</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between py-2 border-b border-slate-800/80">
              <span className="text-slate-400">Plan Tier</span>
              <b className="text-white uppercase">{entitlement?.plan_id || "Standard"}</b>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-800/80">
              <span className="text-slate-400">Entitlement Status</span>
              <span className="font-semibold text-teal-400">{entitlement?.status || "trialing"}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-800/80">
              <span className="text-slate-400">Trial Period End</span>
              <span className="text-slate-200">
                {entitlement?.trial_ends_at
                  ? new Date(entitlement.trial_ends_at).toLocaleDateString("en-IN", { dateStyle: "long" })
                  : "Not set"}
              </span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-800/80">
              <span className="text-slate-400">Conversations Quota</span>
              <span className="text-slate-200">{entitlement?.conversations_quota || "Unlimited"}</span>
            </div>
          </div>
        </section>

        {/* WhatsApp & Channel Connections */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
          <h2 className="text-base font-bold text-white mb-4">Channel Connections</h2>
          <div className="space-y-3">
            {(channels || []).map((ch) => (
              <div key={ch.id} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                    <Radio className="size-4" />
                  </div>
                  <div>
                    <b className="text-sm text-slate-100 block">{ch.display_name || ch.display_address || "WhatsApp Line"}</b>
                    <span className="text-xs text-slate-400 font-mono">{ch.display_address}</span>
                  </div>
                </div>
                <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-400">
                  {ch.status}
                </span>
              </div>
            ))}

            {(!channels || channels.length === 0) && (
              <div className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-xs text-slate-500">
                No active WhatsApp channel connection linked.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
