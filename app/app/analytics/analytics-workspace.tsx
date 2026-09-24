"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  CalendarDays,
  CheckCircle2,
  Clock,
  Download,
  Flame,
  HelpCircle,
  MessageSquare,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react";
import {
  ClinicAnalyticsResult,
  DateRangeKey,
  DoctorResource,
} from "@/lib/analytics-engine";
import { WhatsAppLiveCounter } from "./whatsapp-live-counter";

interface AiInsights {
  executiveSummary: string;
  whatHappened: string;
  whyItMatters: string;
  prescribedActions: Array<{
    role: "Reception lead" | "Clinic manager" | "Workspace admin";
    action: string;
    priority: "high" | "medium" | "low";
  }>;
  laborHoursSavedSummary: string;
  source: "gemini" | "rule_engine";
}

export function AnalyticsWorkspace({
  initialAnalytics,
  initialAiPayload,
  clinicName,
  doctors,
  organizationId,
  initialWhatsappCounts,
}: {
  initialAnalytics: ClinicAnalyticsResult;
  initialAiPayload: any;
  clinicName: string;
  doctors: DoctorResource[];
  organizationId: string;
  initialWhatsappCounts: { messages: number; estimatedCostPaise: number };
}) {
  const [range, setRange] = useState<DateRangeKey>(initialAnalytics.range || "7d");
  const [selectedDoctor, setSelectedDoctor] = useState<string>("all");
  const [analytics, setAnalytics] = useState<ClinicAnalyticsResult>(initialAnalytics);
  const [aiPayload, setAiPayload] = useState<any>(initialAiPayload);
  const [aiInsights, setAiInsights] = useState<AiInsights | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Fetch updated analytics when range or doctor filter changes
  async function reloadAnalytics(newRange = range, newDoc = selectedDoctor) {
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/analytics/summary?range=${newRange}&doctorId=${newDoc}`
        );
        if (res.ok) {
          const data = await res.json();
          setAnalytics(data.analytics);
          setAiPayload(data.sanitizedAiPayload);
          // Trigger AI narration refresh
          fetchAiInsights(data.sanitizedAiPayload);
        }
      } catch (err) {
        console.error("Failed to reload analytics:", err);
      }
    });
  }

  // Fetch AI narration based on sanitized aggregate numbers
  async function fetchAiInsights(payloadToAnalyze = aiPayload) {
    setLoadingAi(true);
    try {
      const res = await fetch("/api/analytics/ai-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metrics: payloadToAnalyze }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiInsights(data);
      }
    } catch (err) {
      console.error("Failed to fetch AI insights:", err);
    } finally {
      setLoadingAi(false);
    }
  }

  // Initial load of AI insights
  useEffect(() => {
    fetchAiInsights(initialAiPayload);
  }, []);

  function handleRangeChange(newRange: DateRangeKey) {
    setRange(newRange);
    reloadAnalytics(newRange, selectedDoctor);
  }

  function handleDoctorChange(newDoc: string) {
    setSelectedDoctor(newDoc);
    reloadAnalytics(range, newDoc);
  }

  function downloadCsv() {
    window.location.href = `/api/analytics/summary?range=${range}&doctorId=${selectedDoctor}&format=csv`;
  }

  const funnel = analytics.funnel;
  const queue = analytics.queueDelays;
  const automation = analytics.automation;
  const fin = analytics.financialAndCare;

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Executive Top Header & Filter Controls */}
      <section className="flex flex-col gap-4 rounded-2xl bg-[radial-gradient(ellipse_at_top_right,#1b74a3_0%,#0c3350_50%,#071c2d_100%)] p-6 text-white shadow-lg md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[#1bc5a8]/20 px-3 py-1 text-xs font-black uppercase tracking-wider text-[#4edcc7] border border-[#1bc5a8]/30">
              CLINIC INTELLIGENCE & VALUE ENGINE
            </span>
            <span className="text-xs text-slate-300">Stage 14A-14E Architecture</span>
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-2xl">
            {clinicName} Operations & Value Analytics
          </h1>
          <p className="mt-1 text-sm text-slate-300">
            Verified operational facts, queue delay benchmarks, and automated staff time savings.
          </p>
        </div>

        {/* Action Controls: Live Counter + Range Selector + Doctor Filter + Export */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Live WhatsApp Usage Counter */}
          <WhatsAppLiveCounter 
            organizationId={organizationId} 
            initialCounts={initialWhatsappCounts} 
          />

          {/* Date Range Selector */}
          <div className="flex items-center rounded-xl bg-white/10 p-1 backdrop-blur-md border border-white/15">
            {(
              [
                ["today", "Today"],
                ["7d", "7 Days"],
                ["30d", "30 Days"],
                ["month", "This Month"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => handleRangeChange(key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  range === key
                    ? "bg-[#1bc5a8] text-[#062c26] shadow-sm font-bold"
                    : "text-slate-200 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Doctor Filter */}
          <select
            value={selectedDoctor}
            onChange={(e) => handleDoctorChange(e.target.value)}
            aria-label="Filter by doctor"
            className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs font-medium text-white backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-[#1bc5a8]"
          >
            <option value="all" className="bg-[#0c3350] text-white">
              All Doctors ({doctors.length})
            </option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id} className="bg-[#0c3350] text-white">
                {d.name}
              </option>
            ))}
          </select>

          {/* Export CSV Button */}
          <button
            type="button"
            onClick={downloadCsv}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 px-3 py-2 text-xs font-bold text-white hover:bg-white/25 transition-all border border-white/20 shadow-sm"
          >
            <Download className="size-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </section>

      {/* 2. AI Operations Copilot Banner (Stage 14E) */}
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

        {/* Three Core Operational Answers */}
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
                  role: "Reception lead" as const,
                  action: "Review doctor chamber pacing to keep average wait under 15 minutes.",
                  priority: "medium" as const,
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

      {/* 3. Hero KPI Metric Cards (5 Pillars) */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {/* Metric 1: Completion Rate */}
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

        {/* Metric 2: No-Show Rate */}
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

        {/* Metric 3: Avg Queue Wait Time */}
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

        {/* Metric 4: Staff Hours Saved */}
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

        {/* Metric 5: Estimated Revenue */}
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

      {/* 4. Deep-Dive Section: Funnel Flow & WhatsApp Automation */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Booking Funnel Drop-off */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs lg:col-span-2">
          <header className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <span className="text-xs font-black tracking-wider text-[#148261] uppercase">
                PATIENT CONVERSION JOURNEY
              </span>
              <h3 className="text-lg font-bold text-slate-900">
                Booking-to-Care Completion Funnel
              </h3>
            </div>
            <span className="text-xs text-slate-500">
              {funnel.booked} Total Inquiries / Bookings
            </span>
          </header>

          <div className="mt-6 space-y-4">
            {/* Step 1: Booked */}
            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-700">
                <span>1. Booked Inquiries</span>
                <span>{funnel.booked} (100%)</span>
              </div>
              <div className="mt-1.5 h-3 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full bg-[#1b74a3] rounded-full" style={{ width: "100%" }} />
              </div>
            </div>

            {/* Step 2: Confirmed */}
            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-700">
                <span>2. Confirmed Bookings</span>
                <span>
                  {funnel.confirmed} ({funnel.confirmationRate}%)
                </span>
              </div>
              <div className="mt-1.5 h-3 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-[#0d9488] rounded-full transition-all duration-500"
                  style={{ width: `${funnel.confirmationRate}%` }}
                />
              </div>
            </div>

            {/* Step 3: Arrived */}
            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-700">
                <span>3. Arrived at Clinic</span>
                <span>
                  {funnel.arrived} ({funnel.arrivalRate}% of confirmed)
                </span>
              </div>
              <div className="mt-1.5 h-3 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-[#148261] rounded-full transition-all duration-500"
                  style={{ width: `${funnel.arrivalRate}%` }}
                />
              </div>
            </div>

            {/* Step 4: Completed */}
            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-700">
                <span>4. Completed Consultation</span>
                <span>
                  {funnel.completed} ({funnel.completionRate}% of total booked)
                </span>
              </div>
              <div className="mt-1.5 h-3 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-[#10b981] rounded-full transition-all duration-500"
                  style={{ width: `${funnel.completionRate}%` }}
                />
              </div>
            </div>
          </div>

          {/* Exceptions bar */}
          <div className="mt-6 flex flex-wrap items-center gap-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600 border border-slate-200/60">
            <span className="font-bold text-slate-800">Drop-off details:</span>
            <span>
              <b>{funnel.noShow}</b> No-Shows ({funnel.noShowRate}%)
            </span>
            <span>•</span>
            <span>
              <b>{funnel.cancelled}</b> Cancellations ({funnel.cancellationRate}%)
            </span>
            <span>•</span>
            <span>
              <b>{funnel.rescheduled}</b> Rescheduled
            </span>
          </div>
        </section>

        {/* WhatsApp Automation Reliability Card */}
        <section className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <div>
            <header className="border-b border-slate-100 pb-3">
              <span className="text-xs font-black tracking-wider text-[#0284c7] uppercase">
                AUTOMATION HEALTH
              </span>
              <h3 className="text-base font-bold text-slate-900">
                WhatsApp Messaging Delivery
              </h3>
            </header>

            <div className="mt-5 space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600">Dispatched Reminders</span>
                <b className="text-sm font-bold text-slate-900">
                  {automation.totalRemindersDispatched}
                </b>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600">Delivered Successfully</span>
                <b className="text-sm font-bold text-[#148261]">
                  {automation.deliveredCount} ({automation.deliveryRate}%)
                </b>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600">Read Receipts</span>
                <b className="text-sm font-bold text-[#0284c7]">
                  {automation.readCount} ({automation.readRate}%)
                </b>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600">Failed / Unreachable</span>
                <b className={`text-sm font-bold ${automation.failedCount > 0 ? "text-rose-600" : "text-slate-400"}`}>
                  {automation.failedCount}
                </b>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-xl bg-[#ecfdf5] p-3.5 border border-[#a7f3d0]">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#065f46]">
              <CheckCircle2 className="size-3.5" />
              <span>Verified Staff Efficiency</span>
            </div>
            <p className="mt-1 text-xs text-[#047857]">
              {automation.staffHoursSaved} receptionist hours saved. Replaces manual verification calls at a benchmark of 4 minutes per reminder.
            </p>
          </div>
        </section>
      </div>

      {/* 5. Doctor-Wise Performance & Queue Matrix */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <span className="text-xs font-black tracking-wider text-[#148261] uppercase">
              MULTI-DOCTOR LOAD
            </span>
            <h3 className="text-base font-bold text-slate-900">
              Doctor Capacity, Punctuality & Revenue
            </h3>
          </div>
          <span className="text-xs font-medium text-slate-500">
            {analytics.doctorSummaries.length} doctors registered
          </span>
        </header>

        {analytics.doctorSummaries.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">
            No doctor appointments recorded for this timeframe.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5">Doctor</th>
                  <th className="px-4 py-3.5 text-center">Bookings</th>
                  <th className="px-4 py-3.5 text-center">Completed</th>
                  <th className="px-4 py-3.5 text-center">No-Shows</th>
                  <th className="px-4 py-3.5 text-center">Completion %</th>
                  <th className="px-4 py-3.5 text-center">Avg Wait Time</th>
                  <th className="px-6 py-3.5 text-right">Est. Collections</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {analytics.doctorSummaries.map((doc) => (
                  <tr key={doc.resourceId} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-6 py-4 font-semibold text-slate-900">
                      {doc.doctorName}
                    </td>
                    <td className="px-4 py-4 text-center font-medium">
                      {doc.totalBookings}
                    </td>
                    <td className="px-4 py-4 text-center text-[#148261] font-bold">
                      {doc.completedCount}
                    </td>
                    <td className="px-4 py-4 text-center font-medium text-amber-700">
                      {doc.noShowCount}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 font-bold text-slate-800">
                        {doc.completionRate}%
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={`font-semibold ${doc.avgWaitTimeMinutes > 20 ? "text-rose-600" : "text-slate-700"}`}>
                        {doc.avgWaitTimeMinutes} mins
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-slate-900">
                      ₹{(doc.estimatedRevenuePaise / 100).toLocaleString("en-IN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 6. Continued Care & Active Operational Alerts */}
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
            {analytics.deterministicAlerts.length === 0 ? (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-4 text-xs font-medium text-emerald-800">
                <CheckCircle2 className="size-4 text-emerald-600" />
                <span>All clinic metrics are currently within healthy operational thresholds.</span>
              </div>
            ) : (
              analytics.deterministicAlerts.map((alert, idx) => (
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
    </div>
  );
}
