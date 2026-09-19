import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { ShieldAlert, Users, CreditCard, Activity, Box } from "lucide-react";
import "../appointments-refresh.css";
import "../clinic-operations-refresh.css";
import "../typography-polish.css";

export const metadata = {
  title: "OEM Control Panel | OmniRelay",
  description: "Platform administration and global oversight.",
};

export default async function OemLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Only allow access to platform operators
  const { data: isOperator } = await supabase.rpc("is_oem_operator");
  if (!isOperator) redirect("/app");

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 selection:bg-[#1bc5a8]/30 selection:text-white">
      {/* Super-admin Sidebar */}
      <aside className="flex w-64 flex-col justify-between border-r border-slate-800 bg-slate-950 p-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#1bc5a8] to-[#0d9488] shadow-lg shadow-[#1bc5a8]/20">
              <ShieldAlert className="size-4 text-white" />
            </div>
            <div>
              <span className="block text-xs font-black tracking-widest text-[#1bc5a8] uppercase">
                OEM PANEL
              </span>
              <span className="block text-[10px] font-medium text-slate-400">
                Super-Admin Mode
              </span>
            </div>
          </div>

          <nav className="mt-8 space-y-1">
            <Link href="/oem" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition-colors">
              <Activity className="size-4 text-slate-400" />
              Global KPIs
            </Link>
            <Link href="/oem/tenants" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition-colors">
              <Users className="size-4 text-slate-400" />
              Tenant Clinics
            </Link>
            <Link href="/oem/billing" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition-colors">
              <CreditCard className="size-4 text-slate-400" />
              Operational Billing
            </Link>
            <Link href="/oem/assets" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition-colors">
              <Box className="size-4 text-slate-400" />
              Partner Assets
            </Link>
          </nav>
        </div>

        <div className="rounded-xl border border-rose-900/50 bg-rose-950/30 p-4">
          <span className="block text-xs font-black uppercase text-rose-500">
            God Mode Active
          </span>
          <p className="mt-1 text-[10px] text-rose-300/70">
            Actions performed here affect the entire platform cluster.
          </p>
          <Link href="/app" className="mt-3 inline-block rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-700 transition-colors">
            Exit to Tenant View
          </Link>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto bg-slate-950/50 p-8">
        <div className="mx-auto max-w-6xl">
          {children}
        </div>
      </main>
    </div>
  );
}
