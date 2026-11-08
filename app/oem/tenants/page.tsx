import { createClient } from "@/lib/supabase/server";
import { TenantDirectory, TenantRow } from "@/components/oem/tenant-directory";

export const dynamic = "force-dynamic";

export default async function OemTenantsPage() {
  const supabase = await createClient();

  let tenants: TenantRow[] = [];
  let errorMsg: string | null = null;

  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc("admin_get_tenant_overview");
    if (rpcError) throw new Error(rpcError.message);

    const { data: orgs, error: orgsError } = await supabase
      .from("organizations")
      .select("id, extra, premium_support_agent_active, premium_growth_agent_active, premium_cto_agent_active, premium_admin_agent_active");

    if (orgsError) throw new Error(orgsError.message);

    const orgMap = new Map((orgs || []).map((o) => [o.id, o]));

    tenants = ((rpcData || []) as TenantRow[]).map((t) => {
      const org = orgMap.get(t.organization_id);
      const extra = (org?.extra || {}) as Record<string, unknown>;
      const features = (extra.features || {}) as Record<string, unknown>;

      return {
        ...t,
        features: {
          google_calendar_sync: Boolean(features.google_calendar_sync),
          premium_support_agent_active: Boolean(org?.premium_support_agent_active),
          premium_growth_agent_active: Boolean(org?.premium_growth_agent_active),
          premium_cto_agent_active: Boolean(org?.premium_cto_agent_active),
          premium_admin_agent_active: Boolean(org?.premium_admin_agent_active),
        },
      };
    });
  } catch (err: unknown) {
    errorMsg = err instanceof Error ? err.message : "Failed to load tenants";
  }

  return (
    <div className="space-y-6">
      <header>
        <span className="text-[11px] font-bold tracking-widest text-[#1bc5a8] uppercase">
          ORGANIZATION DIRECTORY
        </span>
        <h1 className="text-3xl font-black tracking-tight text-white mt-1">Tenant Clinics</h1>
        <p className="mt-1 text-sm text-slate-400">
          Manage, search, monitor, and configure all clinic organizations across the OmniRelay platform.
        </p>
      </header>

      {errorMsg && (
        <div className="rounded-xl border border-rose-900/50 bg-rose-950/30 p-4 text-rose-300 text-sm font-mono">
          <strong>Database Notice:</strong> {errorMsg}
        </div>
      )}

      <TenantDirectory initialTenants={tenants} />
    </div>
  );
}
