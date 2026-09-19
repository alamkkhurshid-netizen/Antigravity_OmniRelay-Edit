import { createClient } from "@/lib/supabase/server";
import { Users, Search, MoreVertical, PowerOff } from "lucide-react";

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
  
  // Call the new RPC we created in the migration
  const { data: tenantsData } = await supabase.rpc("admin_get_tenant_overview");
  const tenants = (tenantsData || []) as TenantOverview[];

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

      <div className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/50 text-xs font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-800">
              <tr>
                <th className="px-6 py-4">Organization</th>
                <th className="px-6 py-4">Plan / Status</th>
                <th className="px-6 py-4">Messages</th>
                <th className="px-6 py-4 text-right">Est. Rev (₹)</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {tenants.map((tenant) => (
                <tr key={tenant.organization_id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4">
                    <b className="block text-slate-100">{tenant.organization_name}</b>
                    <span className="text-xs text-slate-500">{tenant.business_category}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <span className="inline-flex w-fit items-center rounded-md bg-blue-400/10 px-2 py-1 text-xs font-medium text-blue-400 ring-1 ring-inset ring-blue-400/30 uppercase">
                        {tenant.plan_id || "MVP"}
                      </span>
                      <span className={`text-xs ${tenant.status === 'active' ? 'text-[#1bc5a8]' : 'text-amber-400'}`}>
                        {tenant.status || "trialing"}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-400">
                    {tenant.total_messages.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right font-medium text-slate-300">
                    {tenant.estimated_revenue_paise ? (tenant.estimated_revenue_paise / 100).toLocaleString("en-IN") : "0"}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="rounded p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-colors" title="Suspend Tenant">
                      <PowerOff className="size-4" />
                    </button>
                    <button className="ml-1 rounded p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-colors">
                      <MoreVertical className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
              
              {tenants.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    No tenants found.
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
