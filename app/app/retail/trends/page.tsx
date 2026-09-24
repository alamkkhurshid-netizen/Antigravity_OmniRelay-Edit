import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Radar, Search, Activity, FileJson, TrendingUp } from "lucide-react";
import { triggerTrendScrape } from "./actions";

export default async function TrendRadarPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("onboarding_profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (!profile?.organization_id) redirect("/onboarding");

  // Fetch previous reports
  const { data: reports } = await supabase
    .from("trend_intelligence_reports")
    .select("*")
    .eq("organization_id", profile.organization_id)
    .order("created_at", { ascending: false });

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <div className="flex items-center gap-4 mb-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-lg shadow-fuchsia-500/20">
              <Radar className="size-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Trend Radar</h1>
              <p className="text-slate-500">ScrapeGraphAI Competitor & Trend Intelligence</p>
            </div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-3">
          
          {/* Target Input Section */}
          <div className="lg:col-span-1">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sticky top-8">
              <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Search className="size-5 text-indigo-500" /> Autonomous Niche Intelligence
              </h2>
              
              <form action={async (formData) => { "use server"; await triggerTrendScrape(formData); }}>
                <div className="grid gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">
                      Product Niche / Keyword
                    </label>
                    <input 
                      type="text" 
                      name="searchQuery"
                      required
                      placeholder="e.g. Ladies Kurti, Oversized Men's Shirts..." 
                      className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-indigo-500 focus:bg-white transition-colors"
                    />
                  </div>
                  <button 
                    type="submit"
                    className="w-full inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white shadow hover:bg-slate-800 transition-colors"
                  >
                    <Radar className="size-4" /> Run Autonomous SearchGraph
                  </button>
                </div>
              </form>
              
              <div className="mt-6 rounded-xl bg-indigo-50/50 p-4 border border-indigo-100">
                <p className="text-xs text-indigo-900 font-medium mb-2">How it works:</p>
                <p className="text-xs text-indigo-700/80">
                  The AI acts as your Master Researcher. It searches the internet for your keyword, finds the viral videos, extracts top hashtags and engagement triggers, and feeds this intelligence directly to your Creative Engine.
                </p>
              </div>
            </div>
          </div>

          {/* Intelligence Feed */}
          <div className="lg:col-span-2">
            <div className="grid gap-6">
              {reports && reports.length > 0 ? (
                reports.map(report => (
                  <div key={report.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <div className="border-b border-slate-100 p-4 bg-slate-50 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="size-4 text-slate-400" />
                        <span className="text-sm font-medium text-slate-600 truncate max-w-[200px] sm:max-w-md">
                          {report.search_query || report.target_urls?.[0] || 'Unknown Query'}
                        </span>
                      </div>
                      
                      {report.status === 'scraping' ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                          <Activity className="size-3 animate-pulse" /> SCRAPING...
                        </span>
                      ) : report.status === 'failed' ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700">
                          FAILED
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                          COMPLETED
                        </span>
                      )}
                    </div>
                    
                    <div className="p-6">
                      {report.status === 'scraping' && (
                        <div className="flex flex-col items-center justify-center py-6 text-center">
                          <Radar className="size-10 text-indigo-300 animate-spin-slow mb-4" />
                          <h3 className="font-semibold text-slate-900">Scraping the web...</h3>
                          <p className="text-sm text-slate-500 max-w-sm mt-2">
                            ScrapeGraphAI is analyzing the DOM, extracting JSON data, and using LLMs to format the intelligence report.
                          </p>
                        </div>
                      )}

                      {report.status === 'failed' && (
                        <div className="text-sm text-rose-600 bg-rose-50 p-4 rounded-xl border border-rose-100">
                          <b className="block mb-1">Scrape Failed</b>
                          {report.error_message || "Unknown error occurred during scraping."}
                        </div>
                      )}

                      {report.status === 'completed' && report.report_payload && (
                        <div className="grid gap-6">
                          <div>
                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Top Viral Hooks</h4>
                            <div className="flex flex-col gap-2">
                              {report.report_payload.top_hooks?.map((hook: string, idx: number) => (
                                <div key={idx} className="rounded-lg bg-fuchsia-50 p-3 border border-fuchsia-100 text-sm font-medium text-fuchsia-900">
                                  &quot;{hook}&quot;
                                </div>
                              )) || <p className="text-sm text-slate-400">No hooks extracted.</p>}
                            </div>
                          </div>
                          
                          <div className="grid sm:grid-cols-2 gap-6">
                            <div>
                              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Visual Strategy</h4>
                              <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-100 h-full">
                                {report.report_payload.visual_style || "N/A"}
                              </p>
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Viral Hashtags</h4>
                              <div className="flex flex-wrap gap-2 bg-slate-50 p-3 rounded-lg border border-slate-100 h-full">
                                {report.report_payload.top_hashtags?.map((tag: string, idx: number) => (
                                  <span key={idx} className="text-xs font-semibold text-indigo-600 bg-indigo-100 px-2 py-1 rounded-md">
                                    {tag}
                                  </span>
                                )) || <span className="text-sm text-slate-400">N/A</span>}
                              </div>
                            </div>
                          </div>

                          {report.report_payload.engagement_signals && (
                            <div>
                              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Why it&apos;s going viral (Engagement Signals)</h4>
                              <p className="text-sm text-slate-700 bg-amber-50 p-4 rounded-lg border border-amber-100">
                                {report.report_payload.engagement_signals}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-20 rounded-2xl border border-slate-200 border-dashed bg-white">
                  <FileJson className="mx-auto size-12 text-slate-300 mb-4" />
                  <h3 className="text-lg font-bold text-slate-900 mb-2">No Intelligence Reports</h3>
                  <p className="text-sm text-slate-500 max-w-sm mx-auto">
                    Enter a product niche (like &quot;Ladies Kurti&quot;) to let the AI autonomously search the internet and extract what is going viral right now.
                  </p>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
