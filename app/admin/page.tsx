import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ShieldAlert, Check, X, Shield, Users, Crown } from "lucide-react";
import { toggleOrganizationTier, toggleOrganizationDemoStatus, resolveOemDraft } from "./actions";

export default async function AdminDashboardPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Verify OEM Admin
  const { data: isOperator } = await supabase.rpc("is_platform_operator", { required_role: "oem_admin" });
  if (!isOperator) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <ShieldAlert className="mx-auto size-12 text-rose-500 mb-4" />
          <h1 className="text-2xl font-bold text-slate-900">Access Denied</h1>
          <p className="text-slate-500">You must be a Platform Operator to view this page.</p>
        </div>
      </div>
    );
  }

  // Fetch Data
  const { data: organizations } = await supabase
    .from("organizations")
    .select("*")
    .order("created_at", { ascending: false });

  const { data: drafts } = await supabase
    .from("oem_agent_drafts")
    .select("*")
    .eq("status", "pending_approval")
    .order("created_at", { ascending: false });

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg">
            <Shield className="size-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">OEM Master Control</h1>
            <p className="text-slate-500">Platform Autopilot and Tenant Management</p>
          </div>
        </header>

        <div className="grid gap-8 lg:grid-cols-3">
          
          {/* Main Tenant Table */}
          <div className="lg:col-span-2">
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-slate-100 p-6 flex items-center gap-3">
                <Users className="size-5 text-indigo-500" />
                <h2 className="text-lg font-bold text-slate-900">Tenant Organizations</h2>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-6 py-4">Organization</th>
                      <th className="px-6 py-4">Created</th>
                      <th className="px-6 py-4">Tier</th>
                      <th className="px-6 py-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {organizations?.map((org) => (
                      <tr key={org.id} className="hover:bg-slate-50/50">
                        <td className="px-6 py-4 font-medium text-slate-900">{org.name}</td>
                        <td className="px-6 py-4">{new Date(org.created_at).toLocaleDateString()}</td>
                        <td className="px-6 py-4">
                          <form action={async () => { "use server"; await toggleOrganizationTier(org.id, org.subscription_tier); }}>
                            <button 
                              type="submit"
                              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                                org.subscription_tier === 'premium' 
                                  ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' 
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                            >
                              {org.subscription_tier === 'premium' && <Crown className="size-3" />}
                              {org.subscription_tier.toUpperCase()}
                            </button>
                          </form>
                        </td>
                        <td className="px-6 py-4">
                          <form action={async () => { "use server"; await toggleOrganizationDemoStatus(org.id, org.is_demo); }}>
                            <button 
                              type="submit"
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                org.is_demo ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                              }`}
                            >
                              {org.is_demo ? 'SANDBOX' : 'PRODUCTION'}
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* OEM Action Centre (Autopilot) */}
          <div className="lg:col-span-1">
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col h-full">
              <div className="border-b border-slate-100 p-6 bg-slate-900">
                <h2 className="text-lg font-bold text-white">Platform Autopilot</h2>
                <p className="text-sm text-slate-400">Chief of Staff AI Alerts</p>
              </div>

              <div className="p-6 flex-1 bg-slate-50">
                {drafts && drafts.length > 0 ? (
                  <div className="grid gap-4">
                    {drafts.map(draft => (
                      <div key={draft.id} className="rounded-xl border border-indigo-100 bg-white p-4 shadow-sm">
                        <div className="mb-3 flex items-center justify-between">
                          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700">
                            {draft.context_source === 'tenant_churn_risk' ? 'CHURN RISK' : 'ALERT'}
                          </span>
                          <span className="text-xs text-slate-400">
                            {new Date(draft.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </span>
                        </div>
                        
                        <p className="text-sm text-slate-600 mb-4">
                          {draft.draft_payload?.reasoning || "An action is proposed for a tenant."}
                        </p>
                        
                        <div className="mb-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700 border border-slate-100">
                          <p className="font-semibold text-xs text-slate-500 mb-1">PROPOSED MESSAGE:</p>
                          "{draft.draft_payload?.message_text}"
                        </div>

                        <div className="flex items-center gap-2">
                          <form action={async () => { "use server"; await resolveOemDraft(draft.id, 'approve'); }} className="flex-1">
                            <button type="submit" className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-indigo-700">
                              <Check className="size-4" /> Approve
                            </button>
                          </form>
                          <form action={async () => { "use server"; await resolveOemDraft(draft.id, 'reject'); }} className="flex-1">
                            <button type="submit" className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50">
                              <X className="size-4" /> Dismiss
                            </button>
                          </form>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Check className="mx-auto size-8 text-emerald-400 mb-3" />
                    <h3 className="font-semibold text-slate-900">All Clear</h3>
                    <p className="text-sm text-slate-500">The platform is healthy. No autopilot alerts.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
