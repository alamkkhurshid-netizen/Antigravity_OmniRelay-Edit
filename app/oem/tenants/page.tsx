import { createClient } from "@/lib/supabase/server";
import { Users, Search, MoreVertical, PowerOff } from "lucide-react";
import { TenantFeaturesCell } from "./tenant-features-cell";

export const dynamic = "force-dynamic";

type TenantOverview = {
  organization_id: string;
  organization_name: string;
  business_category: string;
  created_at: string;
  plan_id: string;
  status: string;
  total_messages: number;
  estimated_revenue_paise: number;
};

export default async function OemTenantsPage() {
  const supabase = await createClient();
  
  let tenantsData = null;
  let orgsExtra = null;
  let errorMsg = null;

  try {
    const rpcRes = await supabase.rpc("admin_get_tenant_overview");
    if (rpcRes.error) throw new Error("RPC Error: " + rpcRes.error.message);
    tenantsData = rpcRes.data;

    const orgRes = await supabase.from("organizations").select("id, extra, premium_support_agent_active, premium_growth_agent_active, premium_cto_agent_active, premium_admin_agent_active");
    if (orgRes.error) throw new Error("Orgs Error: " + orgRes.error.message);
    orgsExtra = orgRes.data;
  } catch (err: any) {
    errorMsg = err.message;
  }

  const tenants = (tenantsData || []) as TenantOverview[];
  const orgMap = new Map(orgsExtra?.map((o: any) => [o.id, o]));

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Tenant Clinics</h1>
          <p className="mt-1 text-sm text-slate-400">Manage all organizations across the platform.</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
          <input 
            type="text" 
            placeholder="Search clinics..." 
            className="rounded-lg border border-slate-700 bg-slate-900/50 py-2 pl-9 pr-4 text-sm text-slate-200 focus:border-[#1bc5a8] focus:outline-none focus:ring-1 focus:ring-[#1bc5a8]"
          />
        </div>
      </header>

      {errorMsg && (
        <div className="rounded-xl border border-rose-900/50 bg-rose-950/30 p-4 text-rose-400 font-mono text-sm">
          <strong>Backend Error:</strong> {errorMsg}
        </div>
      )}

      <div className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden">
        <div className="flex flex-col">
          <div className="hidden grid-cols-[2fr_1fr_2fr_1fr_1fr_1fr] bg-slate-950/50 px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-800 md:grid">
            <div>Organization</div>
            <div>Plan / Status</div>
            <div>Features</div>
            <div>Messages</div>
            <div className="text-right">Est. Rev (₹)</div>
            <div className="text-right">Actions</div>
          </div>
          <div className="divide-y divide-slate-800">
            {tenants.map((tenant) => (
              <div key={tenant.organization_id} className="grid grid-cols-1 gap-4 p-4 hover:bg-slate-800/30 transition-colors md:grid-cols-[2fr_1fr_2fr_1fr_1fr_1fr] md:items-center md:gap-0 md:px-6 md:py-4">
                <div className="flex flex-col md:block">
                  <span className="text-xs font-semibold uppercase text-slate-500 md:hidden">Organization</span>
                  <b className="block text-slate-100">{tenant.organization_name}</b>
                  <span className="text-xs text-slate-500">{tenant.business_category}</span>
                </div>
                <div className="flex flex-col md:block">
                  <span className="text-xs font-semibold uppercase text-slate-500 md:hidden">Plan / Status</span>
                  <div className="flex flex-col gap-1">
                    <span className="inline-flex w-fit items-center rounded-md bg-blue-400/10 px-2 py-1 text-xs font-medium text-blue-400 ring-1 ring-inset ring-blue-400/30 uppercase">
                      {tenant.plan_id || "MVP"}
                    </span>
                    <span className={`text-xs ${tenant.status === 'active' ? 'text-[#1bc5a8]' : 'text-amber-400'}`}>
                      {tenant.status || "trialing"}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col md:block">
                  <span className="text-xs font-semibold uppercase text-slate-500 md:hidden mb-2">Features</span>
                  <TenantFeaturesCell 
                    organizationId={tenant.organization_id} 
                    initialGoogleSync={!!(orgMap.get(tenant.organization_id) as any)?.extra?.features?.google_calendar_sync} 
                    initialSupportAgent={!!(orgMap.get(tenant.organization_id) as any)?.premium_support_agent_active}
                    initialCtoAgent={!!(orgMap.get(tenant.organization_id) as any)?.premium_cto_agent_active}
                    initialGrowthAgent={!!(orgMap.get(tenant.organization_id) as any)?.premium_growth_agent_active}
                    initialAdminAgent={!!(orgMap.get(tenant.organization_id) as any)?.premium_admin_agent_active}
                  />
                </div>
                <div className="flex items-center justify-between md:block">
                  <span className="text-xs font-semibold uppercase text-slate-500 md:hidden">Messages</span>
                  <span className="text-slate-400">
                    {tenant.total_messages?.toLocaleString?.() || "0"}
                  </span>
                </div>
                <div className="flex items-center justify-between md:block md:text-right">
                  <span className="text-xs font-semibold uppercase text-slate-500 md:hidden">Est. Rev (₹)</span>
                  <span className="font-medium text-slate-300">
                    {tenant.estimated_revenue_paise ? (tenant.estimated_revenue_paise / 100).toLocaleString("en-IN") : "0"}
                  </span>
                </div>
                <div className="flex items-center justify-end gap-1 md:text-right">
                  <button className="rounded p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-colors" title="Suspend Tenant">
                    <PowerOff className="size-4" />
                  </button>
                  <button className="rounded p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-colors">
                    <MoreVertical className="size-4" />
                  </button>
                </div>
              </div>
            ))}
            
            {tenants.length === 0 && (
              <div className="px-6 py-12 text-center text-slate-500">
                No tenants found.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
