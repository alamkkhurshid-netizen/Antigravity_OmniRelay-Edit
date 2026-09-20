import { Building2, CreditCard, PlugZap, ShieldCheck, UsersRound, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export default async function BusinessSetupPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="max-w-5xl mx-auto pb-10">
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Business Setup</h1>
        <p className="mt-2 text-slate-500">Manage your workspace, billing, and team access.</p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Workspace Card */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4 mb-6">
            <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-[#087fb9]/10 text-[#087fb9]">
              <Building2 className="size-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Workspace Profile</h2>
              <p className="text-sm text-slate-500">Business details and branding</p>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Email</label>
              <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 text-sm">
                {user?.email ?? "Not configured"}
              </div>
            </div>
            <button className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 transition-colors">
              Update Profile
            </button>
          </div>
        </section>

        {/* WhatsApp Connection */}
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-6 shadow-sm">
          <div className="flex items-center gap-4 mb-6">
            <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-600">
              <Zap className="size-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">WhatsApp Official API</h2>
              <p className="text-sm text-slate-500">Not connected</p>
            </div>
          </div>
          <p className="text-sm text-slate-600 mb-6">
            Connect your official Meta business number to unlock AI agents and automated booking flows.
          </p>
          <button className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 transition-colors">
            Connect Meta Account
          </button>
        </section>

        {/* Team */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4 mb-6">
            <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
              <UsersRound className="size-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Team Management</h2>
              <p className="text-sm text-slate-500">1 active member</p>
            </div>
          </div>
          <button className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors">
            Invite Team Members
          </button>
        </section>

        {/* Billing */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4 mb-6">
            <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
              <CreditCard className="size-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Billing & Plans</h2>
              <p className="text-sm text-slate-500">Free Trial</p>
            </div>
          </div>
          <button className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors">
            View Upgrade Options
          </button>
        </section>
      </div>
    </div>
  );
}
