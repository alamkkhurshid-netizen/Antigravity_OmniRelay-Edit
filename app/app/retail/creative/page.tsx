import Link from "next/link";
import { ArrowLeft, Sparkles, Play, Search, Video } from "lucide-react";
import { getWorkspace } from "@/lib/workspace";
import { GenerateForm } from "./generate-form";

export default async function CreativeVelocityPage() {
  const { supabase, organization } = await getWorkspace();
  
  // Fetch existing creatives
  const { data: creatives } = await supabase
    .from("retail_creatives")
    .select("*")
    .order("created_at", { ascending: false });

  const safeCreatives = creatives || [];

  return (
    <div className="flex flex-col gap-6 pb-12">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/app/retail" className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors">
            <ArrowLeft className="size-4" /> Back to Dashboard
          </Link>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-fuchsia-100 text-fuchsia-600">
              <Sparkles className="size-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Creative Velocity Engine</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Generate high-converting multi-angle ads using Topview AI to fight ad fatigue.
          </p>
        </div>
        
        <GenerateForm />
      </header>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 mt-6">
        {safeCreatives.length === 0 ? (
          <div className="col-span-full flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-slate-400">
            <Video className="mb-3 size-10 opacity-20" />
            <p className="text-sm font-bold text-slate-600">No creatives yet.</p>
            <p className="text-xs">Paste a product URL above to let OmniRelay generate your 4-Angle Matrix.</p>
          </div>
        ) : (
          safeCreatives.map((creative) => (
            <div key={creative.id} className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:shadow-md">
              <div className="relative aspect-[9/16] bg-slate-900">
                {creative.video_url ? (
                  <video src={creative.video_url} className="h-full w-full object-cover" controls />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center text-slate-500">
                    <Play className="size-8 opacity-20 mb-2" />
                    <span className="text-xs font-bold">Rendering...</span>
                  </div>
                )}
                <div className="absolute top-3 left-3 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-bold tracking-wider text-white uppercase backdrop-blur-md">
                  {creative.angle.replace('_', ' ')}
                </div>
                <div className="absolute top-3 right-3 rounded-full bg-fuchsia-500/90 px-2.5 py-1 text-[10px] font-bold tracking-wider text-white uppercase backdrop-blur-md shadow-sm">
                  {creative.engine}
                </div>
              </div>
              <div className="p-4 flex flex-col gap-2">
                <p className="text-xs font-medium text-slate-700 line-clamp-3">
                  "{creative.hook_script}"
                </p>
                <div className="mt-2 flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase">
                  <span>Product:</span>
                  <a href={creative.product_url} target="_blank" className="text-fuchsia-600 hover:underline truncate max-w-[120px]">
                    Link
                  </a>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
