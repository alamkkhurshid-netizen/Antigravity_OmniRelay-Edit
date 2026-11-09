"use client";

import Link from "next/link";
import { CheckCircle2, CircleAlert, SendHorizontal, ShieldAlert, ArrowUpRight } from "lucide-react";
import { Joyride, Step } from "react-joyride";
import { WorkspaceHero } from "@/components/workspace-hero";
import { useActionCentre } from "./use-action-centre";
import { MobileAlertsControl } from "@/components/action-centre/mobile-alerts-control";
import { PriorityReviewQueue } from "@/components/action-centre/priority-review-queue";
import { AuditTrail } from "@/components/action-centre/audit-trail";
import {
  CareRun, AppointmentRun, Task, Deployment, BookingRequest, WaitlistItem,
  Disruption, EmergencyRecipient, Assignment, ReadinessCheck, PilotControl, AiDraft, CarrierRecoveryEvent
} from "./types";

export function ActionCentreWorkspace({
  careRuns, appointmentRuns, tasks, deployments, bookingRequests, waitlist, disruptions, emergencyRecipients,
  assignments, readinessChecks, pilotControl, aiDrafts, carrierRecoveryEvents = [], currentUserId, canManageNotifications, nowIso
}: {
  careRuns:CareRun[]; appointmentRuns:AppointmentRun[]; tasks:Task[]; deployments:Deployment[];
  bookingRequests:BookingRequest[]; waitlist:WaitlistItem[]; disruptions:Disruption[]; emergencyRecipients:EmergencyRecipient[];
  assignments:Assignment[]; readinessChecks:ReadinessCheck[]; pilotControl:PilotControl|null; aiDrafts:AiDraft[];
  carrierRecoveryEvents?:CarrierRecoveryEvent[];
  currentUserId:string; canManageNotifications:boolean; nowIso:string;
}) {
  const state = useActionCentre({
    careRuns, appointmentRuns, tasks, deployments, bookingRequests, waitlist, disruptions,
    emergencyRecipients, assignments, readinessChecks, pilotControl, aiDrafts, carrierRecoveryEvents, currentUserId, nowIso
  });

  const tourSteps: Step[] = [
    { target: '.sandbox-step-intro', content: 'Welcome to your OmniRelay Sandbox! Let\'s see how your AI Employee manages your daily workflow.' },
    { target: '.sandbox-step-queue', content: 'This is the Priority Review Queue. Hermes has prepared 3 actions for you based on the mock data.' },
    { target: '.sandbox-step-discuss', content: 'This is where the magic happens. Click "Discuss / Refine" to talk to the AI. Give it feedback (e.g. "make the discount 20%") and watch it rewrite the draft instantly!' }
  ];

  const buttonBase = "inline-flex h-9 items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50 shadow-2xs";

  return (
    <main className="or-type-page sandbox-step-intro mx-auto grid max-w-7xl gap-5 pb-12 pt-1">
      <Joyride steps={tourSteps} run={state.runTour} continuous />
      
      {/* 1. GLOWING BLACK AI HERO BANNER (Brand Continuity) */}
      <WorkspaceHero
        tag="WORKSPACE / ACTION CENTRE"
        title="One review. Routine work moves safely."
        subtitle="OmniRelay separates safe operational actions from cases that need a person—without patient-by-patient checking."
        action={
          <aside className="flex min-w-56 flex-col justify-center rounded-2xl border border-white/10 bg-white/5 p-4 shadow-sm backdrop-blur-md z-10">
            <div className="flex items-baseline gap-2">
              <b className="or-type-stat text-3xl font-extrabold tracking-tight text-white">{state.deployable + state.automaticCare.length + state.automaticAppointments.length}</b>
              <span className="text-sm font-medium text-slate-300">routine actions due</span>
            </div>
            <div className="mt-2.5 flex items-center gap-2 text-xs font-bold text-amber-400">
              <ShieldAlert size={15}/>
              <span>{state.exceptions.length} held for review</span>
            </div>
          </aside>
        }
      />

      {/* 2. URGENT EXCEPTION CALLOUT (Clinical Alert) */}
      {state.exceptions.length > 0 && (
        <section className="flex flex-col gap-4 rounded-2xl border border-rose-200 bg-rose-50/70 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-rose-600 text-sm font-bold text-white shadow-xs">!</span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold tracking-widest text-rose-700 uppercase">Needs Attention</span>
                <span className="text-sm font-bold text-rose-950">
                  {state.exceptions.length} action{state.exceptions.length === 1 ? "" : "s"} waiting for review
                </span>
              </div>
              <p className="mt-1 text-sm font-medium text-rose-800/90 leading-relaxed">
                The most urgent items are first. Claim an item before opening the protected patient record.
              </p>
            </div>
          </div>
          <Link className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 shadow-sm shrink-0" href="#priority-review-queue">
            Open review queue <ArrowUpRight size={14}/>
          </Link>
        </section>
      )}

      {/* 3. UNIFIED COMMAND STRIP (Single Patient Safety Verification & One-Click Deploy) */}
      <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Ready to Deploy</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-200/60">
                <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                Safety Gates Cleared
              </span>
            </div>
            <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900 leading-snug">Today&apos;s Patient Action Plan</h2>
            <p className="mt-1.5 text-sm font-medium text-slate-600 leading-relaxed">
              Consent, mobile number, timing, retry limits and approved workflows are checked again during deployment.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
            <button 
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40" 
              disabled={state.busy || state.deployable === 0} 
              onClick={state.deploy}
            >
              <SendHorizontal size={15}/>
              <span>{state.busy ? "Deploying safely…" : state.deployable ? `Review & deploy ${state.deployable} actions` : "Routine actions already automated"}</span>
            </button>
          </div>
        </div>

        {/* Clinical Safety Verification Trust Badges */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 mr-1">Pre-flight checks:</span>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 border border-slate-200/80">
            <CheckCircle2 className="size-4 text-teal-600" /> Patient Consent Active
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 border border-slate-200/80">
            <CheckCircle2 className="size-4 text-teal-600" /> WhatsApp Number Validated
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 border border-slate-200/80">
            <CheckCircle2 className="size-4 text-teal-600" /> 24h Meta Window Bound
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 border border-slate-200/80">
            <CheckCircle2 className="size-4 text-teal-600" /> Retry & Anti-Spam Guarded
          </span>
        </div>

        {state.result && (
          <p className="flex items-center gap-2 rounded-xl bg-emerald-50/80 border border-emerald-200 px-4 py-2.5 text-sm font-semibold text-emerald-800">
            <CheckCircle2 size={15}/> {state.result.deployed_count} released · {state.result.automatic_count} automatic actions remain queued · {state.result.exception_count} exceptions retained
          </p>
        )}
        {state.error && (
          <p className="flex items-center gap-2 rounded-xl bg-rose-50/80 border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-800">
            {state.error}
          </p>
        )}
      </section>

      {/* 4. STAT CARDS (Identical to Overview Page) */}
      <section className="grid gap-4 md:grid-cols-3">
        {state.routine.map(item => (
          <article className="group relative overflow-hidden rounded-2xl bg-white p-6 shadow-sm border border-slate-200 hover:border-slate-300 transition" key={item.label}>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-500 tracking-widest uppercase">{item.label}</h3>
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
                item.tone === "exception" ? "bg-rose-50 text-rose-600" : "bg-teal-50 text-teal-600"
              }`}>
                {item.tone === "exception" ? <CircleAlert className="size-5"/> : <CheckCircle2 className="size-5"/>}
              </div>
            </div>
            <div className="mt-4">
              <span className="or-type-stat text-4xl font-extrabold tracking-tight text-slate-900">{item.count}</span>
              <p className="mt-2 text-sm font-medium text-slate-500 leading-relaxed">{item.detail}</p>
            </div>
          </article>
        ))}
      </section>

      {/* 5. MOBILE ALERT CONTROLS */}
      <MobileAlertsControl
        canManageNotifications={canManageNotifications}
        working={state.working}
        testMobileAlert={state.testMobileAlert}
        archiveHistoricalAlerts={state.archiveHistoricalAlerts}
        buttonBase={buttonBase}
      />

      {/* 6. PRIORITY REVIEW QUEUE (Linear-Grade Triage) */}
      <PriorityReviewQueue
        exceptions={state.exceptions}
        currentUserId={currentUserId}
        working={state.working}
        notice={state.notice}
        error={state.error}
        buttonBase={buttonBase}
        resolveDraft={state.resolveDraft}
        coordinate={state.coordinate}
        updateTask={state.updateTask}
        retry={state.retry}
        resolveCarrierRecovery={state.resolveCarrierRecovery}
      />

      {/* 7. RECENT DEPLOYMENTS AUDIT TRAIL */}
      <AuditTrail deployments={deployments} />
    </main>
  );
}
