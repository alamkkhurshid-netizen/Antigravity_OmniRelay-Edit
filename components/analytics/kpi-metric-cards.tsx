"use client";

import { Activity, AlertTriangle, Clock, TrendingUp, UserCheck } from "lucide-react";
import { ClinicAnalyticsResult } from "@/lib/analytics-engine";

interface KpiMetricCardsProps {
  funnel: ClinicAnalyticsResult["funnel"];
  queue: ClinicAnalyticsResult["queueDelays"];
  automation: ClinicAnalyticsResult["automation"];
  fin: ClinicAnalyticsResult["financialAndCare"];
}

export function KpiMetricCards({ funnel, queue, automation, fin }: KpiMetricCardsProps) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition-hover hover:shadow-md">
        <div className="flex items-center justify-between text-slate-500">
          <span className="text-xs font-bold uppercase tracking-wider">Completion Rate</span>
          <UserCheck className="size-4 text-[#148261]" />
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <b className="text-2xl font-extrabold tracking-tight text-slate-900">
            {funnel.completionRate}%
          </b>
          <span className="text-xs font-medium text-slate-500">
            ({funnel.completed}/{funnel.booked})
          </span>
        </div>
        <small className="mt-2 block text-xs text-slate-500">
          Booked patients who completed visits
        </small>
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition-hover hover:shadow-md">
        <div className="flex items-center justify-between text-slate-500">
          <span className="text-xs font-bold uppercase tracking-wider">No-Show Rate</span>
          <AlertTriangle className="size-4 text-[#d97706]" />
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <b className={`text-2xl font-extrabold tracking-tight ${funnel.noShowRate > 15 ? "text-[#b45309]" : "text-slate-900"}`}>
            {funnel.noShowRate}%
          </b>
          <span className="text-xs font-medium text-slate-500">
            ({funnel.noShow} missed)
          </span>
        </div>
        <small className="mt-2 block text-xs text-slate-500">
          Confirmed visits that did not arrive
        </small>
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition-hover hover:shadow-md">
        <div className="flex items-center justify-between text-slate-500">
          <span className="text-xs font-bold uppercase tracking-wider">Avg Wait Time</span>
          <Clock className="size-4 text-[#0284c7]" />
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <b className="text-2xl font-extrabold tracking-tight text-slate-900">
            {queue.avgWaitTimeMinutes}m
          </b>
          <span className="text-xs font-medium text-slate-500">
            max {queue.maxWaitTimeMinutes}m
          </span>
        </div>
        <small className="mt-2 block text-xs text-slate-500">
          Scheduled slot to doctor chamber entry
        </small>
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition-hover hover:shadow-md">
        <div className="flex items-center justify-between text-slate-500">
          <span className="text-xs font-bold uppercase tracking-wider">Staff Hours Saved</span>
          <TrendingUp className="size-4 text-[#148261]" />
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <b className="text-2xl font-extrabold tracking-tight text-[#148261]">
            {automation.staffHoursSaved}h
          </b>
          <span className="text-xs font-medium text-slate-500">saved</span>
        </div>
        <small className="mt-2 block text-xs text-slate-500">
          Via WhatsApp reminders & confirmations
        </small>
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition-hover hover:shadow-md">
        <div className="flex items-center justify-between text-slate-500">
          <span className="text-xs font-bold uppercase tracking-wider">Est. Revenue</span>
          <Activity className="size-4 text-[#0284c7]" />
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <b className="text-2xl font-extrabold tracking-tight text-slate-900">
            ₹{(fin.totalRevenuePaise / 100).toLocaleString("en-IN")}
          </b>
        </div>
        <small className="mt-2 block text-xs text-slate-500">
          ₹{(fin.onlineRevenuePaise / 100).toLocaleString("en-IN")} online · ₹{(fin.clinicPayRevenuePaise / 100).toLocaleString("en-IN")} clinic
        </small>
      </article>
    </section>
  );
}
