"use client";

import { CheckCircle2, Sparkles } from "lucide-react";

export interface TierSelectionStepProps {
  busy: boolean;
  tier: "standard" | "premium";
  error?: string;
  onSelectTier: (tier: "standard" | "premium") => void;
  onBack: () => void;
}

export function TierSelectionStep({
  busy,
  tier,
  error,
  onSelectTier,
  onBack,
}: TierSelectionStepProps) {
  return (
    <div className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-10 relative overflow-hidden">
      {/* Subtle top accent */}
      <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-[#087fb9] to-[#18bfc5]" />
      
      <div className="flex items-center justify-between mb-8">
        <span className="text-[10px] font-bold tracking-widest text-[#087fb9] uppercase">CHOOSE ENGINE</span>
        <button
          type="button"
          onClick={onBack}
          className="text-xs font-bold text-slate-400 hover:text-slate-700 transition-colors"
        >
          ← BACK TO SETUP
        </button>
      </div>
      
      <h2 className="text-3xl font-semibold tracking-tight text-slate-900">
        Select your automation tier
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        How do you want to handle incoming messages and routing? You can upgrade later.
      </p>

      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        {/* Standard Tier */}
        <button
          type="button"
          onClick={() => onSelectTier("standard")}
          disabled={busy}
          className="group flex flex-col text-left rounded-2xl border-2 border-slate-200 bg-white p-6 transition-all hover:border-slate-300 hover:shadow-md disabled:opacity-50"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center justify-center size-10 rounded-xl bg-slate-100 text-slate-600 transition-colors group-hover:bg-slate-200 group-hover:text-slate-800">
              <CheckCircle2 className="size-5" />
            </div>
            <h3 className="font-semibold text-slate-900 text-xl">Standard</h3>
          </div>
          <p className="text-sm text-slate-500 mb-6 h-10 leading-relaxed">Regular WhatsApp Flow and rule-based manual routing.</p>
          <ul className="text-xs text-slate-600 space-y-3 mb-8 flex-1">
            <li className="flex items-start gap-2"><CheckCircle2 className="size-4 text-slate-400 shrink-0 group-hover:text-emerald-500 transition-colors" /> Unified Action Centre</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="size-4 text-slate-400 shrink-0 group-hover:text-emerald-500 transition-colors" /> Standard Broadcasts</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="size-4 text-slate-400 shrink-0 group-hover:text-emerald-500 transition-colors" /> Manual Escalation</li>
          </ul>
          <div className="mt-auto pt-4 border-t border-slate-100 w-full font-semibold text-center text-slate-500 group-hover:text-slate-800 transition-colors">
            {busy && tier === "standard" ? "Provisioning..." : "Select Standard"}
          </div>
        </button>

        {/* Premium Tier */}
        <button
          type="button"
          onClick={() => onSelectTier("premium")}
          disabled={busy}
          className="group flex flex-col text-left rounded-2xl border-2 border-[#18bfc5]/30 bg-gradient-to-b from-[#18bfc5]/5 to-white p-6 transition-all hover:border-[#18bfc5] hover:shadow-[0_8px_30px_rgba(24,191,197,.15)] relative disabled:opacity-50"
        >
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-[#087fb9] to-[#18bfc5] text-white text-[10px] font-bold tracking-widest uppercase px-4 py-1 rounded-full shadow-sm">
            Recommended
          </div>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center justify-center size-10 rounded-xl bg-gradient-to-br from-[#087fb9] to-[#18bfc5] text-white shadow-md">
              <Sparkles className="size-5" />
            </div>
            <h3 className="font-semibold text-slate-900 text-xl group-hover:text-[#087fb9] transition-colors">Premium AI</h3>
          </div>
          <p className="text-sm text-slate-600 mb-6 h-10 leading-relaxed">RAG AI Concierge & XYFlow Visual Builder.</p>
          <ul className="text-xs text-slate-700 space-y-3 mb-8 flex-1">
            <li className="flex items-start gap-2"><CheckCircle2 className="size-4 text-[#18bfc5] shrink-0" /> Semantic RAG Bot</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="size-4 text-[#18bfc5] shrink-0" /> Upload Custom Documents</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="size-4 text-[#18bfc5] shrink-0" /> XYFlow Drag & Drop Builder</li>
          </ul>
          <div className="mt-auto pt-4 border-t border-[#18bfc5]/20 w-full font-semibold text-center text-[#087fb9]">
            {busy && tier === "premium" ? "Provisioning..." : "Select Premium"}
          </div>
        </button>
      </div>

      {error && (
        <p className="mt-8 rounded-xl bg-red-50 p-4 text-sm font-medium text-red-800 border border-red-100" role="status">
          {error}
        </p>
      )}
    </div>
  );
}
