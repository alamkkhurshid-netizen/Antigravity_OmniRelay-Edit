"use client";

import { Agent } from "@/app/app/agents/types";
import { Bot, CheckCircle2, Circle, Settings2, Activity } from "lucide-react";

interface ConciergeControlProps {
  activeAgent?: Agent;
  readinessChecks: Array<{label: string; detail: string; ready: boolean}>;
  agentReady: boolean;
  setShowAgentSettings: (val: boolean) => void;
}

export function ConciergeControl({
  activeAgent, readinessChecks, agentReady, setShowAgentSettings
}: ConciergeControlProps) {
  const isTraining = (activeAgent?.status ?? "training") === "training";

  return (
    <section className="mb-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:shadow-md">
      <div className="grid md:grid-cols-[1fr_320px]">
        
        {/* Left Side: Info and Checks */}
        <div className="p-6 md:p-8">
          <div className="mb-6 flex items-start justify-between">
            <div>
              <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[#087fb9]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#087fb9]">
                <Bot className="size-3" /> Clinic AI Concierge
              </span>
              <h3 className="mb-2 text-2xl font-bold text-slate-900">
                {activeAgent?.name ?? "Appointment Concierge"}
              </h3>
              <p className="text-sm leading-relaxed text-slate-500">
                Supervised answers from approved clinic knowledge, with automatic handoff for medical advice and urgent language.
              </p>
            </div>
            <div className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${isTraining ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
              <Activity className="size-3" /> {activeAgent?.status ?? "training"}
            </div>
          </div>

          <div className="mt-8 space-y-4">
            {readinessChecks.map((check) => (
              <article 
                className={`flex items-start gap-4 rounded-xl border p-4 transition-colors ${check.ready ? 'border-emerald-100 bg-emerald-50/50' : 'border-slate-100 bg-slate-50'}`} 
                key={check.label}
              >
                <div className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${check.ready ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-400'}`}>
                  {check.ready ? <CheckCircle2 className="size-4" /> : <Circle className="size-4" />}
                </div>
                <div>
                  <b className={`block text-sm font-semibold ${check.ready ? 'text-emerald-900' : 'text-slate-700'}`}>
                    {check.label}
                  </b>
                  <small className="mt-1 block text-xs text-slate-500">{check.detail}</small>
                </div>
              </article>
            ))}
          </div>
        </div>

        {/* Right Side: Action Panel */}
        <div className="flex flex-col justify-center border-t border-slate-100 bg-slate-50 p-6 md:border-l md:border-t-0 md:p-8">
          <div className="mb-6">
            <b className={`block text-base font-bold ${agentReady ? 'text-emerald-700' : 'text-amber-600'}`}>
              {agentReady ? "Core safeguards ready" : "Training requirements incomplete"}
            </b>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {agentReady 
                ? "Configure channels and run the safety test before a supervised WhatsApp pilot." 
                : "Approve at least five clinic FAQs and keep a clear human handoff response."}
            </p>
          </div>
          <button 
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-md" 
            type="button" 
            onClick={() => setShowAgentSettings(true)}
          >
            <Settings2 className="size-4" /> Configure concierge
          </button>
        </div>

      </div>
    </section>
  );
}
