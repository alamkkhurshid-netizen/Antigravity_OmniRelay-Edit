"use client";

import { Check, Sparkles, Shield, Rocket, ArrowRight } from "lucide-react";

export function PremiumUpsell({
  supportActive,
  ctoActive,
  growthActive,
  adminActive
}: {
  supportActive: boolean;
  ctoActive: boolean;
  growthActive: boolean;
  adminActive: boolean;
}) {
  const isAllActive = supportActive && ctoActive && growthActive && adminActive;

  return (
    <div className={`mb-8 rounded-2xl border p-6 md:p-8 ${isAllActive ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-indigo-500/20 bg-indigo-500/5'}`}>
      <div className="mb-6 flex items-center gap-3">
        <div className={`grid size-10 place-items-center rounded-xl text-white shadow-lg ${isAllActive ? 'bg-emerald-500 shadow-emerald-500/20' : 'bg-indigo-500 shadow-indigo-500/20'}`}>
          <Sparkles className="size-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-800">
            {isAllActive ? 'Your Premium AI Agents' : 'Unlock Premium AI Agents'}
          </h2>
          <p className="text-sm text-slate-500">
            {isAllActive 
              ? 'Your autonomous AI executive team is fully active and monitoring your business.'
              : 'Supercharge your workspace with autonomous AI employees.'}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Support Agent */}
        <div className={`relative flex flex-col justify-between rounded-xl border p-5 transition-all ${supportActive ? 'border-emerald-200 bg-emerald-50 shadow-sm shadow-emerald-100' : 'border-slate-200 bg-white hover:border-indigo-300 hover:shadow-md'}`}>
          <div>
            <div className="mb-3 flex items-center justify-between">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${supportActive ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'}`}>
                {supportActive ? <><Check className="size-3" /> Active</> : 'PRO Tier'}
              </span>
            </div>
            <h3 className="mb-2 text-base font-bold text-slate-800">Support Lead AI</h3>
            <p className="text-sm text-slate-600">Autonomously resolves patient/customer inquiries via WhatsApp using your exact business knowledge base.</p>
          </div>
          {supportActive ? (
            <button className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700">
              Manage Agent
            </button>
          ) : (
            <button className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-600">
              Upgrade to Unlock <ArrowRight className="size-4" />
            </button>
          )}
        </div>

        {/* Super CTO */}
        <div className={`relative flex flex-col justify-between rounded-xl border p-5 transition-all ${ctoActive ? 'border-emerald-200 bg-emerald-50 shadow-sm shadow-emerald-100' : 'border-slate-200 bg-white hover:border-indigo-300 hover:shadow-md'}`}>
          <div>
            <div className="mb-3 flex items-center justify-between">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${ctoActive ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'}`}>
                {ctoActive ? <><Check className="size-3" /> Active</> : 'PRO Tier'}
              </span>
            </div>
            <h3 className="mb-2 flex items-center gap-2 text-base font-bold text-slate-800">
              Super CTO <Shield className="size-4 text-slate-400" />
            </h3>
            <p className="text-sm text-slate-600">Your AI engineering team. Automatically monitors API errors and writes patches to keep your integrations running 24/7.</p>
          </div>
          {ctoActive ? (
            <button className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700">
              Manage Agent
            </button>
          ) : (
            <button className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-600">
              Upgrade to Unlock <ArrowRight className="size-4" />
            </button>
          )}
        </div>

        {/* Growth Officer */}
        <div className={`relative flex flex-col justify-between rounded-xl border p-5 transition-all ${growthActive ? 'border-emerald-200 bg-emerald-50 shadow-sm shadow-emerald-100' : 'border-slate-200 bg-white hover:border-indigo-300 hover:shadow-md'}`}>
          <div>
            <div className="mb-3 flex items-center justify-between">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${growthActive ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'}`}>
                {growthActive ? <><Check className="size-3" /> Active</> : 'PRO Tier'}
              </span>
            </div>
            <h3 className="mb-2 flex items-center gap-2 text-base font-bold text-slate-800">
              Growth Officer <Rocket className="size-4 text-slate-400" />
            </h3>
            <p className="text-sm text-slate-600">Analyzes your weekly traffic, conversations, and drop-offs to deliver actionable business strategy briefs directly to you.</p>
          </div>
          {growthActive ? (
            <button className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700">
              View Insights
            </button>
          ) : (
            <button className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-600">
              Upgrade to Unlock <ArrowRight className="size-4" />
            </button>
          )}
        </div>

        {/* Admin Agent */}
        <div className={`relative flex flex-col justify-between rounded-xl border p-5 transition-all ${adminActive ? 'border-emerald-200 bg-emerald-50 shadow-sm shadow-emerald-100' : 'border-slate-200 bg-white hover:border-indigo-300 hover:shadow-md'}`}>
          <div>
            <div className="mb-3 flex items-center justify-between">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${adminActive ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'}`}>
                {adminActive ? <><Check className="size-3" /> Active</> : 'PRO Tier'}
              </span>
            </div>
            <h3 className="mb-2 flex items-center gap-2 text-base font-bold text-slate-800">
              Admin Agent
            </h3>
            <p className="text-sm text-slate-600">The Ultimate Manager. Streamlines operations, manages permissions, and automates back-office administrative tasks.</p>
          </div>
          {adminActive ? (
            <button className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700">
              Manage Agent
            </button>
          ) : (
            <button className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-600">
              Upgrade to Unlock <ArrowRight className="size-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
