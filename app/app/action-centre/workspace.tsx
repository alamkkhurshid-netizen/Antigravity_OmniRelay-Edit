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
  Disruption, EmergencyRecipient, Assignment, ReadinessCheck, PilotControl, AiDraft
} from "./types";

export function ActionCentreWorkspace({
  careRuns, appointmentRuns, tasks, deployments, bookingRequests, waitlist, disruptions, emergencyRecipients,
  assignments, readinessChecks, pilotControl, aiDrafts, currentUserId, canManageNotifications, nowIso
}: {
  careRuns:CareRun[]; appointmentRuns:AppointmentRun[]; tasks:Task[]; deployments:Deployment[];
  bookingRequests:BookingRequest[]; waitlist:WaitlistItem[]; disruptions:Disruption[]; emergencyRecipients:EmergencyRecipient[];
  assignments:Assignment[]; readinessChecks:ReadinessCheck[]; pilotControl:PilotControl|null; aiDrafts:AiDraft[];
  currentUserId:string; canManageNotifications:boolean; nowIso:string;
}) {
  const state = useActionCentre({
    careRuns, appointmentRuns, tasks, deployments, bookingRequests, waitlist, disruptions,
    emergencyRecipients, assignments, readinessChecks, pilotControl, aiDrafts, currentUserId, nowIso
  });

  const tourSteps: Step[] = [
    { target: '.sandbox-step-intro', content: 'Welcome to your OmniRelay Sandbox! Let\'s see how your AI Employee manages your daily workflow.' },
    { target: '.sandbox-step-queue', content: 'This is the Priority Review Queue. Hermes has prepared 3 actions for you based on the mock data.' },
    { target: '.sandbox-step-discuss', content: 'This is where the magic happens. Click "Discuss / Refine" to talk to the AI. Give it feedback (e.g. "make the discount 20%") and watch it rewrite the draft instantly!' }
  ];

  const buttonBase = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <main className="sandbox-step-intro mx-auto grid max-w-7xl gap-5 pb-12">
      {/* @ts-ignore */}
      <Joyride steps={tourSteps} run={state.runTour} continuous />
      
      <WorkspaceHero
        tag="WORKSPACE / ACTION CENTRE"
        title="One review. Routine work moves safely."
        subtitle="OmniRelay separates safe operational actions from cases that need a person—without patient-by-patient checking."
        action={
          <aside className="flex min-w-48 flex-col justify-center rounded-xl border border-white/10 bg-white/5 p-4 shadow-sm backdrop-blur-md z-10">
            <div className="flex items-baseline gap-2">
              <b className="text-2xl font-bold tracking-tight text-white">{state.deployable + state.automaticCare.length + state.automaticAppointments.length}</b>
              <span className="text-sm font-medium text-slate-400">routine actions due</span>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-amber-400">
              <ShieldAlert size={14}/>{state.exceptions.length} held for review
            </div>
          </aside>
        }
      />

      {state.exceptions.length > 0 && (
        <section className="flex flex-col gap-4 rounded-2xl border border-rose-200 bg-rose-50 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-rose-600 text-sm font-black text-white">!</span>
            <div>
              <span className="text-xs font-black tracking-[.1em] text-rose-600">NEEDS ATTENTION</span>
              <h2 className="text-lg font-bold text-slate-900 mt-1">{state.exceptions.length} action{state.exceptions.length === 1 ? "" : "s"} waiting for review</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">The most urgent items are first. Claim an item before opening the protected patient record.</p>
            </div>
          </div>
          <Link className={`${buttonBase} shrink-0 bg-rose-600 text-white hover:bg-rose-700`} href="#priority-review-queue">
            Open review queue <ArrowUpRight size={15}/>
          </Link>
        </section>
      )}

      <section className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <span className="text-xs font-black tracking-[.1em] text-slate-500">READY TO DEPLOY</span>
          <h2 className="text-lg font-bold text-slate-900 mt-1">Today&apos;s patient action plan</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Consent, mobile number, timing, retry limits and approved workflows are checked again during deployment.</p>
        </div>
        <button 
          className={`${buttonBase} bg-slate-900 text-white hover:bg-slate-800`} 
          disabled={state.busy || state.deployable === 0} 
          onClick={state.deploy}
        >
          <SendHorizontal size={16}/>{state.busy ? "Deploying safely…" : state.deployable ? `Review & deploy ${state.deployable} actions` : "Routine actions already automated"}
        </button>
        {state.result && (
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-700 lg:col-span-2">
            <CheckCircle2 size={16}/> {state.result.deployed_count} released · {state.result.automatic_count} automatic actions remain queued · {state.result.exception_count} exceptions retained
          </p>
        )}
        {state.error && <p className="text-sm font-medium text-rose-600 lg:col-span-2">{state.error}</p>}
      </section>

      <MobileAlertsControl
        canManageNotifications={canManageNotifications}
        working={state.working}
        testMobileAlert={state.testMobileAlert}
        archiveHistoricalAlerts={state.archiveHistoricalAlerts}
        buttonBase={buttonBase}
      />

      <section className="grid gap-4 md:grid-cols-3">
        {state.routine.map(item => (
          <article className="flex items-start gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm" key={item.label}>
            <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${item.tone === "exception" ? "bg-rose-50 text-rose-600" : "bg-teal-50 text-teal-700"}`}>
              {item.tone === "exception" ? <CircleAlert size={20}/> : <CheckCircle2 size={20}/>}
            </span>
            <div className="min-w-0">
              <b className="block text-sm">{item.label}</b>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">{item.detail}</span>
            </div>
            <strong className="or-type-stat ml-auto">{item.count}</strong>
          </article>
        ))}
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-teal-200 bg-teal-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <b className="block text-sm text-slate-900">Deploy safe actions together</b>
          <span className="mt-1 block text-sm text-slate-600">Only consented, due actions are included. Each exception below stays available for separate review.</span>
        </div>
        <button 
          className={`${buttonBase} shrink-0 bg-primary text-primary-foreground hover:bg-primary/90`} 
          disabled={state.busy || state.deployable === 0} 
          onClick={state.deploy}
        >
          <SendHorizontal size={16}/>{state.busy ? "Deploying safely…" : state.deployable ? `Deploy all safe actions (${state.deployable})` : "No safe actions ready"}
        </button>
      </section>

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
      />

      <AuditTrail deployments={deployments} />
    </main>
  );
}
