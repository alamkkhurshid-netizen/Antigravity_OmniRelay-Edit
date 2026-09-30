"use client";

import { CheckCircle2 } from "lucide-react";
import { ClinicAnalyticsResult } from "@/lib/analytics-engine";

interface CareAndAlertsProps {
  fin: ClinicAnalyticsResult["financialAndCare"];
  deterministicAlerts: ClinicAnalyticsResult["deterministicAlerts"];
}

export function CareAndAlerts({ fin, deterministicAlerts }: CareAndAlertsProps) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Care Plan Follow-up Desk Status */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <header className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <span className="text-xs font-black tracking-wider text-[#148261] uppercase">
              CONTINUED CARE
            </span>
            <h3 className="text-base font-bold text-slate-900">
              Post-Consultation Follow-up Desk
            </h3>
          </div>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800">
            {fin.careTaskCompletionRate}% Completed
          </span>
        </header>
        <div className="mt-5 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl bg-slate-50 p-3">
            <span className="text-xs text-slate-500">Planned Follow-ups</span>
            <b className="mt-1 block text-xl font-extrabold text-slate-900">
              {fin.plannedCareTasks}
            </b>
          </div>
          <div className="rounded-xl bg-[#e7f8ee] p-3 text-[#148261]">
            <span className="text-xs font-medium">Completed</span>
            <b className="mt-1 block text-xl font-extrabold">
              {fin.completedCareTasks}
            </b>
          </div>
          <div className="rounded-xl bg-rose-50 p-3 text-rose-700">
            <span className="text-xs font-medium">Overdue Backlog</span>
            <b className="mt-1 block text-xl font-extrabold">
              {fin.overdueCareTasks}
            </b>
          </div>
        </div>
        <p className="mt-4 text-xs text-slate-500">
          Patients receiving care follow-up via WhatsApp within 5D/10D/15D windows have a 35% higher return visit rate.
        </p>
      </section>

      {/* Deterministic Bottlenecks & Priority Alerts */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <header className="border-b border-slate-100 pb-3">
          <span className="text-xs font-black tracking-wider text-[#b45309] uppercase">
            OPERATIONAL BOTTLENECK SIGNALS
          </span>
          <h3 className="text-base font-bold text-slate-900">
            Active Rule Alerts & Recommendations
          </h3>
        </header>
        <div className="mt-4 space-y-3">
          {deterministicAlerts.length === 0 ? (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-4 text-xs font-medium text-emerald-800">
              <CheckCircle2 className="size-4 text-emerald-600" />
              <span>All clinic metrics are currently within healthy operational thresholds.</span>
            </div>
          ) : (
            deterministicAlerts.map((alert, idx) => (
              <div
                key={idx}
                className={`rounded-xl p-3.5 text-xs border ${
                  alert.severity === "urgent"
                    ? "bg-rose-50 border-rose-200 text-rose-900"
                    : "bg-amber-50 border-amber-200 text-amber-900"
                }`}
              >
                <div className="flex items-center justify-between font-bold">
                  <span>{alert.title}</span>
                  <span className="rounded bg-white/70 px-2 py-0.5 text-[10px] uppercase font-black">
                    Action: {alert.recommendedRole}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed opacity-90">
                  {alert.detail}
                </p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
