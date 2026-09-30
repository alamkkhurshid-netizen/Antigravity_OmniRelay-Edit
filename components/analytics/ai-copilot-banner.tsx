"use client";

import { CheckCircle2, Flame, RefreshCw, Sparkles, Users } from "lucide-react";
import { AiInsights } from "@/app/app/analytics/types";
import { ClinicAnalyticsResult } from "@/lib/analytics-engine";

interface AiCopilotBannerProps {
  aiInsights: AiInsights | null;
  loadingAi: boolean;
  isPending: boolean;
  fetchAiInsights: () => void;
  funnel: ClinicAnalyticsResult["funnel"];
}

export function AiCopilotBanner({
  aiInsights, loadingAi, isPending, fetchAiInsights, funnel
}: AiCopilotBannerProps) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-[#b2e5df] bg-gradient-to-br from-[#f2fbf9] via-[#e8f7f5] to-[#f4f9fd] p-6 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#148261] text-white shadow-md">
            <Sparkles className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-[#0d3b37]">
                AI Operations Copilot
              </h2>
              <span className="rounded-full bg-[#d7f3ec] px-2.5 py-0.5 text-[10px] font-black uppercase text-[#148261]">
                {aiInsights?.source === "gemini"
                  ? "Gemini 2.5 Flash Verified"
                  : "Deterministic Rule Engine"}
              </span>
            </div>
            <p className="mt-1 text-xs text-[#35665f]">
              Strict Zero-PHI operational narration. Synthesizes pre-calculated clinic facts without exposing patient identity.
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={loadingAi || isPending}
          onClick={() => fetchAiInsights()}
          className="inline-flex items-center gap-1.5 self-start rounded-lg border border-[#a2ded5] bg-white px-3 py-1.5 text-xs font-bold text-[#148261] hover:bg-[#e7f7f4] disabled:opacity-50 transition-all shadow-xs"
        >
          <RefreshCw className={`size-3.5 ${loadingAi ? "animate-spin" : ""}`} />
          <span>{loadingAi ? "Analyzing..." : "Refresh Insights"}</span>
        </button>
      </div>

      <div className="mt-5 grid gap-4 border-t border-[#c6ece6] pt-4 md:grid-cols-3">
        {/* Q1: What Happened? */}
        <div className="rounded-xl bg-white/80 p-4 border border-[#cbebe5] shadow-xs">
          <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-[#148261]">
            <CheckCircle2 className="size-3.5" />
            <span>1. What Happened?</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-[#1a4440]">
            {aiInsights?.whatHappened ||
              `${funnel.completed} consultations completed out of ${funnel.booked} bookings (${funnel.completionRate}% completion rate).`}
          </p>
        </div>

        {/* Q2: Why Does It Matter? */}
        <div className="rounded-xl bg-white/80 p-4 border border-[#cbebe5] shadow-xs">
          <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-[#b45309]">
            <Flame className="size-3.5 text-[#d97706]" />
            <span>2. Why It Matters</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-[#5c3c0a]">
            {aiInsights?.whyItMatters ||
              (funnel.noShowRate > 15
                ? `Elevated no-show rate (${funnel.noShowRate}%) represents revenue drop-off. WhatsApp 24h reminders should be tuned.`
                : `Clinic operates at healthy efficiency with a low ${funnel.noShowRate}% no-show rate.`)}
          </p>
        </div>

        {/* Q3: Whose Action Is Needed? */}
        <div className="rounded-xl bg-white/80 p-4 border border-[#cbebe5] shadow-xs">
          <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-[#0369a1]">
            <Users className="size-3.5 text-[#0284c7]" />
            <span>3. Prescribed Staff Actions</span>
          </div>
          <div className="mt-2 space-y-1.5">
            {(aiInsights?.prescribedActions || [
              {
                role: "Reception lead",
                action: "Review doctor chamber pacing to keep average wait under 15 minutes.",
                priority: "medium",
              },
            ]).map((act, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[11px] leading-tight text-[#0f354a]">
                <span className="shrink-0 rounded bg-[#e0f2fe] px-1.5 py-0.5 text-[10px] font-bold text-[#0369a1]">
                  {act.role}
                </span>
                <span>{act.action}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
