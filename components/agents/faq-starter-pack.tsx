"use client";

import { FileQuestion, DownloadCloud } from "lucide-react";

interface FaqStarterPackProps {
  approvedFaqs: number;
  totalFaqs: number;
  starterRemaining: number;
  busy: boolean;
  installStarterPack: () => void;
}

export function FaqStarterPack({
  approvedFaqs, totalFaqs, starterRemaining, busy, installStarterPack
}: FaqStarterPackProps) {
  const readyPercent = totalFaqs ? Math.round((approvedFaqs / totalFaqs) * 100) : 0;
  
  return (
    <section className="mb-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:shadow-md">
      <div className="grid md:grid-cols-[1fr_320px]">
        
        {/* Left Side: Copy and Stats */}
        <div className="p-6 md:p-8">
          <div className="mb-6">
            <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-violet-700">
              <FileQuestion className="size-3" /> Clinic FAQ Starter Pack
            </span>
            <h3 className="mb-2 text-2xl font-bold text-slate-900">
              Approve the answers patients may receive.
            </h3>
            <p className="text-sm leading-relaxed text-slate-500">
              Install twenty standard clinic questions as drafts. Edit the wording for your clinic, then approve only the answers your team has verified.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
            <div className="text-center">
              <b className="block text-2xl font-bold text-emerald-600">{approvedFaqs}</b>
              <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Approved</span>
            </div>
            <div className="border-l border-slate-200 text-center">
              <b className="block text-2xl font-bold text-slate-700">{totalFaqs}</b>
              <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Total</span>
            </div>
            <div className="border-l border-slate-200 text-center">
              <b className={`block text-2xl font-bold ${starterRemaining === 0 ? 'text-emerald-600' : 'text-amber-500'}`}>
                {starterRemaining}
              </b>
              <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Missing drafts</span>
            </div>
          </div>
        </div>

        {/* Right Side: Action Panel */}
        <div className="flex flex-col justify-center border-t border-slate-100 bg-slate-50 p-6 md:border-l md:border-t-0 md:p-8">
          
          <div className="mb-6">
            <div className="mb-2 flex items-center justify-between text-sm font-semibold">
              <span className="text-slate-700">Agent Readiness</span>
              <span className="text-[#087fb9]">{readyPercent}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div 
                className="h-full bg-gradient-to-r from-[#087fb9] to-[#18bfc5] transition-all duration-500"
                style={{ width: `${readyPercent}%` }}
              />
            </div>
          </div>

          <button 
            className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-md disabled:pointer-events-none disabled:opacity-50" 
            type="button" 
            disabled={busy || starterRemaining === 0} 
            onClick={() => void installStarterPack()}
          >
            <DownloadCloud className="size-4" />
            {starterRemaining === 0 ? "Starter pack installed" : busy ? "Adding draft FAQs…" : `Add ${starterRemaining} draft FAQs`}
          </button>
          
          <small className="text-center text-xs text-slate-500">
            Draft answers are never used in patient conversations.
          </small>
        </div>

      </div>
    </section>
  );
}
