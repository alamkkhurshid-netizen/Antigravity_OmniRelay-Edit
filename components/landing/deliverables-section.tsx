"use client";

import { useState } from "react";
import { CheckCircle2, UserCheck, BrainCircuit } from "lucide-react";
import { Mark } from "./shared";

const deliverables = [
  ["DOCUMENT RAG", "Instant Document-Trained RAG", "Upload your menus, service catalogs, price lists, or operating schedules. OmniRelay ingests them instantly, training an AI agent that answers customer questions with absolute factual precision."],
  ["META SIGNUP", "Meta Embedded Signup", "Connect your official WhatsApp Business Account (WABA) in one click. Zero complex API routing, full compliance, and customer-owned billing."],
  ["UNIFIED INBOX", "Unified Team Inbox & Handoff", "When a customer needs a human touch, the conversation flows seamlessly into a shared team inbox equipped with full context history and smart tagging."],
  ["ASYNC ONBOARDING", "Asynchronous Onboarding", "Drag and drop your data files; our backend parses and vectorizes everything automatically. No engineering required."]
];

export function DeliverablesSection() {
  const [flow, setFlow] = useState(0);

  return (
    <section id="solutions" className="py-10 lg:py-12 bg-slate-50/50 border-y border-slate-100">
      <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-[0.9fr_1.1fr] gap-10 items-center">
        <div>
          <span className="text-[10px] font-bold text-[#087fb9] tracking-widest uppercase mb-2 block">What We Deliver</span>
          <h2 className="text-3xl lg:text-4xl font-semibold tracking-tight text-slate-900 leading-tight mb-8">
            Everything you need,<br />
            <span className="text-slate-400">unified in one layer.</span>
          </h2>
          
          <div className="flex flex-wrap gap-2 mb-8">
            {deliverables.map((d, i) => (
              <button 
                key={d[0]} 
                onClick={() => setFlow(i)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  flow === i ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}
              >
                {d[0]}
              </button>
            ))}
          </div>
          
          <div className="p-5 rounded-xl bg-white border border-slate-100 shadow-sm relative">
            <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase mb-1 block">0{flow + 1}</span>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">{deliverables[flow][1]}</h3>
            <p className="text-sm text-slate-500 leading-relaxed">{deliverables[flow][2]}</p>
          </div>
        </div>
        
        <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
          <div className="max-w-[240px] mx-auto p-3 rounded-lg border border-slate-100 bg-slate-50 flex items-center gap-3">
            <div className="w-6 h-6 rounded border border-slate-200 bg-white flex items-center justify-center text-slate-400 text-xs">✉</div>
            <div>
              <span className="block text-xs font-semibold text-slate-900">New customer signal</span>
            </div>
          </div>
          
          <div className="flex justify-center py-4">
            <div className="w-px h-10 bg-gradient-to-b from-slate-200 to-[#087fb9]/50" />
          </div>
          
          <div className="max-w-[280px] mx-auto p-4 rounded-xl border border-slate-200 bg-slate-900 text-white shadow-md flex flex-col items-center text-center">
            <Mark />
            <span className="text-[10px] font-semibold text-slate-400 tracking-wider mt-3 mb-0.5">OmniRelay Engine</span>
            <span className="text-sm font-medium">Understands. Routes. Acts.</span>
          </div>
          
          <div className="flex justify-center py-4">
            <div className="w-px h-10 bg-gradient-to-b from-[#087fb9]/50 to-slate-200" />
          </div>
          
          <div className="grid grid-cols-3 gap-2">
            <div className="py-2 px-1 rounded-lg border border-slate-100 bg-slate-50 text-center">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mx-auto mb-1" />
              <span className="text-[10px] font-semibold text-slate-600">Resolved</span>
            </div>
            <div className="py-2 px-1 rounded-lg border border-slate-100 bg-slate-50 text-center">
              <UserCheck className="w-3.5 h-3.5 text-[#087fb9] mx-auto mb-1" />
              <span className="text-[10px] font-semibold text-slate-600">Handoff</span>
            </div>
            <div className="py-2 px-1 rounded-lg border border-slate-100 bg-slate-50 text-center">
              <BrainCircuit className="w-3.5 h-3.5 text-[#18bfc5] mx-auto mb-1" />
              <span className="text-[10px] font-semibold text-slate-600">Learned</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
