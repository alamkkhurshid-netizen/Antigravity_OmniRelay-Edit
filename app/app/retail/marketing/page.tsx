import Link from "next/link";
import { ArrowLeft, Target, Database, Rss, AlertCircle } from "lucide-react";
import { getWorkspace } from "@/lib/workspace";

export default async function MarketingAutopilotPage() {
  const { supabase, organization } = await getWorkspace();
  
  // Fetch campaigns and integration status
  const { data: orgData } = await supabase
    .from("organizations")
    .select("meta_pixel_id, meta_access_token")
    .eq("id", organization.id)
    .single();
    
  const { data: campaigns } = await supabase
    .from("marketing_campaigns")
    .select("*")
    .order("created_at", { ascending: false });

  const hasCapi = !!(orgData?.meta_pixel_id && orgData?.meta_access_token);
  const catalogUrl = `https://omnirelay.io/api/meta/catalog?org_id=${organization.id}`;

  return (
    <div className="flex flex-col gap-6 pb-12">
      <header className="flex flex-col gap-4">
        <div>
          <Link href="/app/retail" className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors">
            <ArrowLeft className="size-4" /> Back to Dashboard
          </Link>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
              <Target className="size-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Meta Ads Autopilot</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Zero-learning execution. We handle CAPI, dynamic catalogs, and creative testing for you.
          </p>
        </div>
      </header>

      {/* Integrations Grid */}
      <div className="grid gap-6 sm:grid-cols-2">
        {/* CAPI Status */}
        <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`flex size-10 items-center justify-center rounded-xl ${hasCapi ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                <Database className="size-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">Conversions API (CAPI)</h3>
                <p className="text-xs text-slate-500">Server-side purchase tracking</p>
              </div>
            </div>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${hasCapi ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
              {hasCapi ? 'Connected' : 'Action Required'}
            </span>
          </div>
          <div className="mt-4 text-sm text-slate-600">
            {hasCapi 
              ? "OmniRelay is actively syncing your completed Kanban orders back to Facebook to train the algorithm."
              : "Please enter your Meta Pixel ID and Access Token to enable server-side tracking."}
          </div>
        </div>

        {/* Catalog Sync */}
        <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                <Rss className="size-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">Dynamic Catalog Feed</h3>
                <p className="text-xs text-slate-500">Live XML for Commerce Manager</p>
              </div>
            </div>
            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
              Active
            </span>
          </div>
          <div className="mt-4">
            <p className="text-xs text-slate-500 mb-2">Paste this URL into Facebook Data Sources:</p>
            <div className="flex items-center gap-2 rounded-lg bg-slate-100 p-2 text-xs font-mono text-slate-700">
              <code className="truncate flex-1">{catalogUrl}</code>
              <button className="text-blue-600 hover:underline font-bold px-2">Copy</button>
            </div>
          </div>
        </div>
      </div>

      {/* Campaigns */}
      <div className="mt-6 flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 p-6 bg-slate-50/50">
          <div>
            <h3 className="font-bold text-slate-900">Active Campaigns</h3>
            <p className="text-xs text-slate-500">Manage your automated ad spend</p>
          </div>
          <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow hover:bg-blue-700 transition-colors">
            + Launch New Campaign
          </button>
        </div>
        <div className="p-12 text-center flex flex-col items-center justify-center">
          <AlertCircle className="size-8 text-slate-300 mb-2" />
          <p className="text-sm font-bold text-slate-500">No active campaigns</p>
          <p className="text-xs text-slate-400 mt-1">Click launch to use the Creative Velocity Engine and start spending.</p>
        </div>
      </div>
    </div>
  );
}
