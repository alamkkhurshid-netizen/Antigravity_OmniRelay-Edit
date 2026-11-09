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
  careRuns: CareRun[]; appointmentRuns: AppointmentRun[]; tasks: Task[]; deployments: Deployment[];
  bookingRequests: BookingRequest[]; waitlist: WaitlistItem[]; disruptions: Disruption[]; emergencyRecipients: EmergencyRecipient[];
  assignments: Assignment[]; readinessChecks: ReadinessCheck[]; pilotControl: PilotControl | null; aiDrafts: AiDraft[];
  carrierRecoveryEvents?: CarrierRecoveryEvent[];
  currentUserId: string; canManageNotifications: boolean; nowIso: string;
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

  const buttonBase = "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 shadow-2xs";

  return (
    <main className="or-type-page sandbox-step-intro mx-auto grid max-w-7xl gap-3.5 pb-12 pt-1">
      <Joyride steps={tourSteps} run={state.runTour} continuous />

      {/* 1. GLOWING BLACK AI HERO BANNER (Brand Continuity) */}
      <WorkspaceHero
        tag="WORKSPACE / ACTION CENTRE"
        title="One review. Routine work moves safely."
        subtitle="OmniRelay separates safe operational actions from cases that need a person—without patient-by-patient checking."
        action={
          <aside className="flex min-w-48 flex-col justify-center rounded-xl border border-white/10 bg-white/5 p-3 shadow-sm backdrop-blur-md z-10">
            <div className="flex items-baseline gap-2">
              <b className="or-type-stat text-2xl font-bold tracking-tight text-white">{state.deployable + state.automaticCare.length + state.automaticAppointments.length}</b>
              <span className="text-xs font-medium text-slate-300">routine actions due</span>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-amber-400">
              <ShieldAlert size={14} />
              <span>{state.exceptions.length} held for review</span>
            </div>
          </aside>
        }
      />

      {/* 2. URGENT EXCEPTION CALLOUT (Clinical Alert) */}
      {state.exceptions.length > 0 && (
        <section className="flex flex-col gap-2.5 rounded-xl border border-rose-200/80 bg-rose-50/60 p-3 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-rose-600 text-xs font-bold text-white shadow-xs">!</span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold tracking-wider text-rose-700 uppercase">Needs Attention</span>
                <span className="text-xs font-bold text-rose-900">
                  {state.exceptions.length} action{state.exceptions.length === 1 ? "" : "s"} waiting for review
                </span>
              </div>
              <p className="text-[11px] text-rose-700/80 leading-snug">
                The most urgent items are first. Claim an item before opening the protected patient record.
              </p>
            </div>
          </div>
          <Link className="inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md bg-rose-600 px-3 text-[11px] font-semibold text-white hover:bg-rose-700 transition" href="#priority-review-queue">
            Open review queue <ArrowUpRight size={12} />
          </Link>
        </section>
      )}

      {/* 3. READY TO DEPLOY COMMAND STRIP (Slim High-Density Bar) */}
      <section className="flex flex-col gap-2.5 rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">Ready to Deploy</span>
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 border border-emerald-200">
                <span className="size-1.5 rounded-full bg-emerald-600 animate-pulse" />
                Safety Gates Cleared
              </span>
            </div>
            <h2 className="mt-0.5 text-sm font-bold text-slate-900 leading-snug">Today&apos;s Patient Action Plan</h2>
            <p className="mt-0.5 text-xs font-medium text-slate-700 leading-normal">
              Consent, mobile number, timing, retry limits and approved workflows are checked again during deployment.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3.5 text-xs font-semibold text-white shadow-xs transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={state.busy || state.deployable === 0}
              onClick={state.deploy}
            >
              <SendHorizontal size={13} />
              <span>{state.busy ? "Deploying safely…" : state.deployable ? `Review & deploy ${state.deployable} actions` : "Routine actions already automated"}</span>
            </button>
          </div>
        </div>

        {/* Clinical Safety Verification Trust Badges */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 mr-1">Pre-flight checks:</span>
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100/80 px-2 py-0.5 text-[10px] font-semibold text-slate-800 border border-slate-200/80">
            <CheckCircle2 className="size-3 text-teal-700" /> Patient Consent Active
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100/80 px-2 py-0.5 text-[10px] font-semibold text-slate-800 border border-slate-200/80">
            <CheckCircle2 className="size-3 text-teal-700" /> WhatsApp Number Validated
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100/80 px-2 py-0.5 text-[10px] font-semibold text-slate-800 border border-slate-200/80">
            <CheckCircle2 className="size-3 text-teal-700" /> 24h Meta Window Bound
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100/80 px-2 py-0.5 text-[10px] font-semibold text-slate-800 border border-slate-200/80">
            <CheckCircle2 className="size-3 text-teal-700" /> Retry & Anti-Spam Guarded
          </span>
        </div>

        {state.result && (
          <p className="flex items-center gap-1.5 rounded-md bg-emerald-50/80 border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-800">
            <CheckCircle2 size={13} /> {state.result.deployed_count} released · {state.result.automatic_count} automatic actions remain queued · {state.result.exception_count} exceptions retained
          </p>
        )}
        {state.error && (
          <p className="flex items-center gap-1.5 rounded-md bg-rose-50/80 border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-800">
            {state.error}
          </p>
        )}
      </section>

      {/* 4. HIGH-DENSITY ROUTINE METRICS STRIP (Crisp High-Contrast Typography) */}
      <section className="grid gap-3 md:grid-cols-3">
        {state.routine.map(item => (
          <article className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs hover:border-slate-300 transition" key={item.label}>
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-xs font-bold text-slate-900 leading-snug">{item.label}</h3>
              <div className={`grid size-7 shrink-0 place-items-center rounded-md ${item.tone === "exception" ? "bg-rose-50 text-rose-600" : "bg-teal-50 text-teal-700"
                }`}>
                {item.tone === "exception" ? <CircleAlert size={14} /> : <CheckCircle2 size={14} />}
              </div>
            </div>
            <div className="mt-2">
              <span className="or-type-stat text-2xl font-bold tracking-tight text-slate-900">{item.count}</span>
              <p className="mt-0.5 text-[11px] font-medium text-slate-600 leading-snug">{item.detail}</p>
            </div>
          </article>
        ))}
      </section>

      {/* 5. PRIORITY REVIEW QUEUE (Immediately Visible Above The Fold) */}
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

      {/* 6. MOBILE ALERT CONTROLS (Compact Utility Strip) */}
      <MobileAlertsControl
        canManageNotifications={canManageNotifications}
        working={state.working}
        testMobileAlert={state.testMobileAlert}
        archiveHistoricalAlerts={state.archiveHistoricalAlerts}
        buttonBase={buttonBase}
      />

      {/* 7. RECENT DEPLOYMENTS AUDIT TRAIL */}
      <AuditTrail deployments={deployments} />
    </main>
  );
}
