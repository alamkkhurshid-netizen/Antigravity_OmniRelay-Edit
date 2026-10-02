"use client";

import { SafetyResult } from "@/app/app/agents/types";
import { ShieldCheck, CheckCircle2, AlertOctagon, ActivitySquare } from "lucide-react";

interface SafetySuiteProps {
  safetyTesting: boolean;
  safetyResults: SafetyResult[];
  runSafetySuite: () => void;
}

export function SafetySuite({
  safetyTesting, safetyResults, runSafetySuite
}: SafetySuiteProps) {
  return (
    <section className="mb-8 overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 text-white shadow-lg transition-all hover:shadow-xl relative">
      {/* Background Glow */}
      <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl" />
      <div className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-[#18bfc5]/20 blur-3xl" />

      <div className="grid md:grid-cols-[1fr_400px] relative z-10">
        
        {/* Left Side: Copy */}
        <div className="p-6 md:p-8">
          <div className="mb-6 flex items-start gap-4">
            <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.2)]">
              <ShieldCheck className="size-6" />
            </div>
            <div>
              <span className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-[#18bfc5]">
                PRE-LAUNCH SAFETY TEST
              </span>
              <h3 className="mb-2 text-2xl font-bold text-white">
                Prove the concierge knows when to stop.
              </h3>
              <p className="text-sm leading-relaxed text-slate-400 max-w-md">
                Four deterministic checks verify business answers, clinical handoff and urgent escalation. This does not send any patient message.
              </p>
            </div>
          </div>
        </div>

        {/* Right Side: Action and Results */}
        <div className="border-t border-slate-700/50 bg-slate-800/50 backdrop-blur-sm p-6 md:border-l md:border-t-0 md:p-8 flex flex-col justify-center">
          
          <button 
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-3.5 text-sm font-semibold text-white shadow-[0_0_20px_rgba(99,102,241,0.3)] transition-all hover:-translate-y-0.5 hover:bg-indigo-400 hover:shadow-[0_0_25px_rgba(99,102,241,0.5)] disabled:pointer-events-none disabled:opacity-50" 
            type="button" 
            disabled={safetyTesting} 
            onClick={() => void runSafetySuite()}
          >
            <ActivitySquare className="size-4" />
            {safetyTesting ? "Running safety checks…" : "Run four safety checks"}
          </button>

          {safetyResults.length > 0 && (
            <div className="mt-6 space-y-3">
              <span className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Latest Results
              </span>
              <div className="space-y-2">
                {safetyResults.map((result) => (
                  <article 
                    className={`flex items-start gap-3 rounded-lg border p-3 ${
                      result.passed 
                        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-100" 
                        : "border-rose-500/20 bg-rose-500/10 text-rose-100"
                    }`} 
                    key={result.question}
                  >
                    <div className={`mt-0.5 shrink-0 ${result.passed ? "text-emerald-400" : "text-rose-400"}`}>
                      {result.passed ? <CheckCircle2 className="size-4" /> : <AlertOctagon className="size-4" />}
                    </div>
                    <div>
                      <b className="block text-xs font-bold">{result.question}</b>
                      <small className="mt-0.5 block text-[10px] uppercase tracking-wider opacity-70">
                        {result.actual.replaceAll("_", " ")}
                      </small>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </section>
  );
}
