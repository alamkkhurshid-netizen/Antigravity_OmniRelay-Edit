"use client";

import { FormEvent } from "react";
import { Preview } from "@/app/app/agents/types";
import { Beaker, Sparkles, AlertTriangle, ShieldCheck, PlayCircle } from "lucide-react";

interface GroundingLabProps {
  testQuestion: string;
  setTestQuestion: (val: string) => void;
  testing: boolean;
  preview: Preview | null;
  testAgent: (event: FormEvent<HTMLFormElement>) => void;
}

export function GroundingLab({
  testQuestion, setTestQuestion, testing, preview, testAgent
}: GroundingLabProps) {
  return (
    <section className="mb-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:shadow-md">
      <div className="grid md:grid-cols-[1fr_400px]">
        
        {/* Left Side: Copy and Example Questions */}
        <div className="p-6 md:p-8">
          <div className="mb-6">
            <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-rose-700">
              <Beaker className="size-3" /> Grounding Lab
            </span>
            <h3 className="mb-2 text-2xl font-bold text-slate-900">
              Test before the agent talks to a patient.
            </h3>
            <p className="text-sm leading-relaxed text-slate-500">
              Ask a real patient question. OmniRelay shows the exact approved sources and live clinic facts it can use—or hands the question to staff when evidence is missing.
            </p>
          </div>

          <div className="mt-6">
            <span className="mb-3 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Example questions
            </span>
            <div className="flex flex-wrap gap-2">
              {["What is the consultation fee?", "Where is the chamber?", "How should I prepare for my appointment?"].map((question) => (
                <button 
                  type="button" 
                  key={question} 
                  onClick={() => setTestQuestion(question)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition-colors hover:border-[#087fb9] hover:text-[#087fb9]"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Side: Testing Console */}
        <div className="border-t border-slate-100 bg-slate-50 p-6 md:border-l md:border-t-0 md:p-8">
          <form onSubmit={testAgent} className="flex h-full flex-col">
            <label className="mb-4 block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-700">Patient question</span>
              <textarea 
                value={testQuestion} 
                onChange={(event) => setTestQuestion(event.target.value)} 
                minLength={3} 
                maxLength={500} 
                required 
                placeholder="Ask the concierge a question…"
                className="h-24 w-full resize-none rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#087fb9] focus:outline-none focus:ring-2 focus:ring-[#087fb9]/20"
              />
            </label>
            
            <button 
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-md disabled:pointer-events-none disabled:opacity-50" 
              disabled={testing}
            >
              <PlayCircle className="size-4" />
              {testing ? "Checking approved sources…" : "Run grounded preview"}
            </button>

            {preview && (
              <div className={`mt-6 rounded-xl border p-4 ${
                preview.confidence === "grounded" 
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900" 
                  : preview.confidence === "limited" 
                    ? "border-amber-200 bg-amber-50 text-amber-900" 
                    : "border-rose-200 bg-rose-50 text-rose-900"
              }`}>
                <header className="mb-2 flex items-center justify-between">
                  <b className="flex items-center gap-1.5 text-sm font-bold">
                    {preview.confidence === "grounded" ? <><ShieldCheck className="size-4" /> Grounded answer</> : preview.confidence === "limited" ? <><AlertTriangle className="size-4" /> Limited evidence</> : <><Sparkles className="size-4" /> Human handoff</>}
                  </b>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    preview.confidence === "grounded" ? "bg-emerald-200/50 text-emerald-800" : preview.confidence === "limited" ? "bg-amber-200/50 text-amber-800" : "bg-rose-200/50 text-rose-800"
                  }`}>
                    {preview.confidence}
                  </span>
                </header>
                <p className="text-sm leading-relaxed">{preview.answer}</p>
                
                {preview.sources.length > 0 && (
                  <div className="mt-4 border-t border-black/5 pt-3">
                    <small className="mb-2 block text-xs font-semibold opacity-60">Sources used</small>
                    <ul className="space-y-1">
                      {preview.sources.map((source) => (
                        <li key={source.id} className="text-xs italic opacity-80 flex items-start gap-1.5">
                          <span className="mt-0.5 text-[10px]">■</span> {source.title}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <footer className="mt-4 rounded-lg bg-white/40 p-2 text-xs font-medium italic opacity-90">
                  {preview.safety}
                </footer>
              </div>
            )}
          </form>
        </div>

      </div>
    </section>
  );
}
