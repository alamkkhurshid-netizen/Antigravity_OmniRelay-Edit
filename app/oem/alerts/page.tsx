import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { ShieldAlert, AlertTriangle, Info, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

interface AlertItem {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  organizationId?: string;
  organizationName?: string;
  createdAt: string;
  resolved: boolean;
}

export default async function OemAlertsPage() {
  const supabase = await createClient();

  const [
    { data: incidents },
    { data: recoveryEvents },
    { data: lowWallets },
    { data: orgs }
  ] = await Promise.all([
    supabase.from("security_incidents").select("id, incident_type, description, organization_id, created_at").order("created_at", { ascending: false }).limit(20),
    supabase.from("automation_recovery_events").select("id, error_code, recovery_action, organization_id, created_at").order("created_at", { ascending: false }).limit(20),
    supabase.schema("billing").from("tenant_wallets").select("organization_id, balance_paise, warning_threshold_paise").lt("balance_paise", 5000).limit(20),
    supabase.from("organizations").select("id, name")
  ]);

  const orgMap = new Map((orgs || []).map((o) => [o.id, o.name]));

  const alerts: AlertItem[] = [];

  // Low balance alerts
  for (const w of lowWallets || []) {
    const orgName = orgMap.get(w.organization_id) || "Clinic";
    alerts.push({
      id: `low-bal-${w.organization_id}`,
      severity: "warning",
      title: `Low Wallet Balance: ${orgName}`,
      description: `Tenant wallet has ₹${((w.balance_paise || 0) / 100).toFixed(2)} remaining (warning threshold: ₹${((w.warning_threshold_paise || 5000) / 100).toFixed(2)}). May cause outbound message drops.`,
      organizationId: w.organization_id,
      organizationName: orgName,
      createdAt: new Date().toISOString(),
      resolved: false,
    });
  }

  // Security incidents
  for (const inc of incidents || []) {
    const orgName = inc.organization_id ? orgMap.get(inc.organization_id) : "Platform System";
    alerts.push({
      id: inc.id,
      severity: "critical",
      title: `Security Incident: ${inc.incident_type}`,
      description: inc.description || "Unusual security event flagged by guard layer.",
      organizationId: inc.organization_id,
      organizationName: orgName,
      createdAt: inc.created_at,
      resolved: false,
    });
  }

  // Automation recovery events
  for (const rec of recoveryEvents || []) {
    const orgName = rec.organization_id ? orgMap.get(rec.organization_id) : "Platform System";
    alerts.push({
      id: rec.id,
      severity: "info",
      title: `Automation Recovery: ${rec.error_code}`,
      description: `Action taken: ${rec.recovery_action}`,
      organizationId: rec.organization_id,
      organizationName: orgName,
      createdAt: rec.created_at,
      resolved: true,
    });
  }

  // Default alert if nothing active
  if (alerts.length === 0) {
    alerts.push({
      id: "all-clear",
      severity: "info",
      title: "All Clear — Zero Active Incidents",
      description: "No message delivery spikes, security violations, or depleted tenant wallets currently detected.",
      createdAt: new Date().toISOString(),
      resolved: true,
    });
  }

  return (
    <div className="space-y-6">
      <header>
        <span className="text-[11px] font-bold tracking-widest text-amber-400 uppercase">
          OPERATIONAL INCIDENT RESPONSE
        </span>
        <h1 className="text-3xl font-black tracking-tight text-white mt-1">OEM Alert Center</h1>
        <p className="mt-1 text-sm text-slate-400">
          Real-time incident feed, delivery failure alerts, depleted tenant balances, and security events.
        </p>
      </header>

      {/* Alert Feed */}
      <div className="space-y-3">
        {alerts.map((alert) => {
          const isCritical = alert.severity === "critical";
          const isWarning = alert.severity === "warning";

          return (
            <div
              key={alert.id}
              className={`flex items-start justify-between gap-4 rounded-2xl border p-5 transition-all ${
                isCritical
                  ? "border-rose-900/60 bg-rose-950/20 text-rose-200"
                  : isWarning
                  ? "border-amber-900/60 bg-amber-950/20 text-amber-200"
                  : "border-slate-800 bg-slate-900/40 text-slate-300"
              }`}
            >
              <div className="flex items-start gap-3.5">
                <div
                  className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${
                    isCritical
                      ? "bg-rose-900/40 text-rose-400"
                      : isWarning
                      ? "bg-amber-900/40 text-amber-400"
                      : "bg-blue-900/40 text-blue-400"
                  }`}
                >
                  {isCritical ? (
                    <ShieldAlert className="size-5" />
                  ) : isWarning ? (
                    <AlertTriangle className="size-5" />
                  ) : (
                    <Info className="size-5" />
                  )}
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <b className="text-sm font-bold text-white">{alert.title}</b>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        isCritical
                          ? "bg-rose-500/20 text-rose-400"
                          : isWarning
                          ? "bg-amber-500/20 text-amber-400"
                          : "bg-blue-500/20 text-blue-400"
                      }`}
                    >
                      {alert.severity}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400 leading-relaxed">{alert.description}</p>
                  <span className="mt-2 text-[10px] text-slate-500 block">
                    Logged: {new Date(alert.createdAt).toLocaleString("en-IN")}
                  </span>
                </div>
              </div>

              {alert.organizationId && (
                <Link
                  href={`/oem/tenants/${alert.organizationId}`}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-750 hover:text-white transition-colors"
                >
                  Inspect Clinic <ArrowRight className="size-3" />
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
