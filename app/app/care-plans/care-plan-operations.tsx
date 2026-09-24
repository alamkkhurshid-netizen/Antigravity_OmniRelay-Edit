"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { ArrowUpRight, CalendarClock, CheckCircle2, CircleAlert, ClipboardList, Search, UserRound } from "lucide-react";

type PlanStatus = "active" | "paused" | "completed" | "cancelled";
type Plan = { id:string; patient_id:string; plan_type:string; title:string; goal:string|null; instructions:string|null; status:PlanStatus; starts_on:string; target_date:string|null; next_review_at:string|null; assigned_to:string|null; created_at:string; updated_at:string };
type Patient = { id:string; full_name:string; phone:string; health_concern:string|null; care_communications_consent:boolean; last_seen_at:string };
type Reminder = { id:string; care_plan_id:string; status:string; next_run_at:string|null; last_run_at:string|null };
type Task = { id:string; care_plan_id:string; status:string; due_at:string|null; priority:string; assigned_to:string|null };
type Staff = { user_id:string|null; name:string };
type Filter = "attention" | "active" | "paused" | "completed" | "all";

const terminalStatuses = new Set<PlanStatus>(["completed", "cancelled"]);
const failedReminderStatuses = new Set(["failed", "blocked", "cancelled"]);

function dateLabel(value:string|null) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en-IN", { day:"numeric", month:"short", year:"numeric", hour:"numeric", minute:"2-digit", timeZone:"Asia/Kolkata" }).format(new Date(value));
}

export function CarePlanOperations({ plans:initialPlans, patients, reminders, tasks, staff, canManage, nowIso }:{ plans:Plan[]; patients:Patient[]; reminders:Reminder[]; tasks:Task[]; staff:Staff[]; canManage:boolean; nowIso:string }) {
  const [plans, setPlans] = useState(initialPlans);
  const [filter, setFilter] = useState<Filter>("attention");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string|null>(null);
  const [message, setMessage] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const now = new Date(nowIso).getTime();
  const sevenDays = now + 7 * 24 * 60 * 60 * 1000;
  const patientMap = useMemo(() => new Map(patients.map((patient) => [patient.id, patient])), [patients]);
  const staffMap = useMemo(() => new Map(staff.filter((member) => member.user_id).map((member) => [member.user_id as string, member.name])), [staff]);
  const reminderMap = useMemo(() => new Map(reminders.map((reminder) => [reminder.care_plan_id, reminder])), [reminders]);
  const taskMap = useMemo(() => new Map(tasks.map((task) => [task.care_plan_id, task])), [tasks]);

  const metrics = useMemo(() => {
    let active = 0, dueSoon = 0, overdue = 0, failed = 0;
    for (const plan of plans) {
      if (plan.status === "active") active += 1;
      if (terminalStatuses.has(plan.status)) continue;
      const reviewAt = plan.next_review_at ? new Date(plan.next_review_at).getTime() : null;
      if (reviewAt && reviewAt < now) overdue += 1;
      else if (reviewAt && reviewAt <= sevenDays) dueSoon += 1;
      const reminder = reminderMap.get(plan.id);
      if (reminder && failedReminderStatuses.has(reminder.status)) failed += 1;
    }
    return { active, dueSoon, overdue, failed };
  }, [plans, now, sevenDays, reminderMap]);

  const visiblePlans = useMemo(() => plans.filter((plan) => {
    const patient = patientMap.get(plan.patient_id);
    const reviewAt = plan.next_review_at ? new Date(plan.next_review_at).getTime() : null;
    const reminder = reminderMap.get(plan.id);
    const attention = !terminalStatuses.has(plan.status) && (!reviewAt || reviewAt <= sevenDays || Boolean(reminder && failedReminderStatuses.has(reminder.status)));
    const matchesFilter = filter === "all" || (filter === "attention" ? attention : plan.status === filter);
    const searchable = `${plan.title} ${plan.plan_type} ${patient?.full_name ?? ""} ${patient?.phone ?? ""} ${patient?.health_concern ?? ""}`.toLowerCase();
    return matchesFilter && (!deferredQuery || searchable.includes(deferredQuery));
  }), [plans, filter, deferredQuery, patientMap, reminderMap, sevenDays]);

  async function updatePlan(id:string, status:PlanStatus) {
    setBusyId(id); setMessage("");
    const response = await fetch("/api/patients/care-plans", { method:"PATCH", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ id, status }) });
    const result = await response.json();
    setBusyId(null);
    if (!response.ok || !result.plan) { setMessage(result.error ?? "Care plan could not be updated."); return; }
    setPlans((current) => current.map((plan) => plan.id === id ? result.plan : plan));
    setMessage(status === "completed" ? "Care plan and linked follow-ups completed." : status === "paused" ? "Care plan and linked follow-ups paused." : "Care plan reactivated.");
  }

  const buttonBase="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50";
  return <main className="mx-auto grid max-w-7xl gap-5 pb-12">
    <section className="grid gap-5 overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_82%_12%,rgba(51,198,221,.42),transparent_26%),linear-gradient(115deg,#06182e,#0b4263)] px-6 py-7 text-white shadow-[0_18px_48px_rgba(7,19,38,.14)] sm:px-6 lg:grid-cols-[1fr_auto] lg:items-end"><div><span className="text-xs font-black tracking-[.18em] text-teal-300">CONTINUED CARE OPERATIONS</span><h1 className="mt-3 max-w-2xl text-2xl font-semibold tracking-tight sm:text-2xl">Every follow-up, visible and owned.</h1><p className="mt-3 max-w-2xl text-base leading-7 text-slate-200">Review active patient plans across the clinic, prioritize overdue work and catch reminder failures before a patient is missed.</p></div><Link className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-bold text-primary hover:bg-slate-100" href="/app/contacts">Create plan <ArrowUpRight size={16}/></Link></section>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Care plan summary">{[{label:"Active plans",value:metrics.active,detail:"Continued-care journeys",icon:ClipboardList,tone:"text-primary bg-sky-50"},{label:"Due in 7 days",value:metrics.dueSoon,detail:"Reviews approaching",icon:CalendarClock,tone:"text-amber-700 bg-amber-50"},{label:"Overdue",value:metrics.overdue,detail:"Requires staff action",icon:CircleAlert,tone:"text-rose-700 bg-rose-50"},{label:"Reminder issues",value:metrics.failed,detail:"Blocked or failed outreach",icon:CircleAlert,tone:"text-rose-700 bg-rose-50"}].map(item=>{const Icon=item.icon;return <article className="rounded-2xl border border-border bg-white p-5 shadow-sm" key={item.label}><span className={`grid size-10 place-items-center rounded-xl ${item.tone}`}><Icon size={20}/></span><b className="mt-4 block text-2xl">{item.value}</b><span className="mt-1 block text-sm font-bold">{item.label}</span><small className="mt-1 block text-xs text-muted-foreground">{item.detail}</small></article>})}</section>
    {message ? <p className="rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-800" role="status">{message}</p> : null}
    <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-[0_12px_36px_rgba(7,19,38,.06)]"><header className="flex flex-col gap-4 border-b border-border p-5 xl:flex-row xl:items-end xl:justify-between"><div><span className="text-xs font-black tracking-[.15em] text-primary">CLINIC QUEUE</span><h2 className="mt-2 text-2xl font-semibold tracking-tight">Care-plan reviews</h2></div><div className="flex flex-col gap-3 lg:flex-row lg:items-center"><label className="flex min-h-10 min-w-64 items-center gap-2 rounded-xl border border-input bg-white px-3"><Search size={16} className="text-muted-foreground"/><span className="sr-only">Search care plans</span><input className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search patient or plan" /></label><div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-muted p-1" aria-label="Filter care plans">{(["attention","active","paused","completed","all"] as Filter[]).map((item) => <button className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-bold transition ${filter === item ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`} key={item} onClick={() => setFilter(item)}>{item === "attention" ? "Needs attention" : item[0].toUpperCase() + item.slice(1)}</button>)}</div></div></header>
      <div role="table" aria-label="Care plans"><div className="hidden grid-cols-[minmax(230px,1.7fr)_minmax(145px,1fr)_minmax(125px,.8fr)_minmax(155px,1fr)_auto] gap-4 border-b border-border bg-muted/40 px-5 py-3 text-xs font-black uppercase tracking-wider text-muted-foreground lg:grid" role="row"><span>Patient and plan</span><span>Review</span><span>Owner</span><span>Follow-up</span><span>Action</span></div>{visiblePlans.length ? visiblePlans.map((plan) => {
        const patient = patientMap.get(plan.patient_id), reminder = reminderMap.get(plan.id), task = taskMap.get(plan.id);
        const reviewAt = plan.next_review_at ? new Date(plan.next_review_at).getTime() : null;
        const overdue = Boolean(reviewAt && reviewAt < now && !terminalStatuses.has(plan.status));
        const dueSoon = Boolean(reviewAt && reviewAt >= now && reviewAt <= sevenDays && !terminalStatuses.has(plan.status));
        const reviewStatus=overdue?"Overdue":dueSoon?"Due soon":plan.status;
        return <article className="grid gap-4 border-b border-border p-5 last:border-b-0 lg:grid-cols-[minmax(230px,1.7fr)_minmax(145px,1fr)_minmax(125px,.8fr)_minmax(155px,1fr)_auto] lg:items-center" role="row" key={plan.id}><div><span className="flex items-center gap-2 text-sm font-bold"><span className="grid size-8 place-items-center rounded-xl bg-teal-50 text-teal-700"><UserRound size={16}/></span>{patient?.full_name ?? "Patient"}</span><span className="mt-2 block text-sm font-medium">{plan.title}</span><small className="mt-1 block text-xs text-muted-foreground">{plan.plan_type.replaceAll("_", " ")}{patient?.health_concern ? ` · ${patient.health_concern}` : ""}</small></div><div><span className="text-xs font-black uppercase tracking-wider text-muted-foreground lg:hidden">Review</span><b className="mt-1 block text-sm">{dateLabel(plan.next_review_at)}</b><span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${overdue?"bg-rose-50 text-rose-700":dueSoon?"bg-amber-50 text-amber-700":"bg-muted text-muted-foreground"}`}>{reviewStatus}</span>{task ? <small className="mt-1 block text-xs text-muted-foreground">Task {task.status.replaceAll("_", " ")}</small> : null}</div><div><span className="text-xs font-black uppercase tracking-wider text-muted-foreground lg:hidden">Owner</span><b className="mt-1 block text-sm">{plan.assigned_to ? staffMap.get(plan.assigned_to) ?? "Assigned staff" : "Clinic queue"}</b><small className="mt-1 block text-xs text-muted-foreground">{task?.priority ? `${task.priority} priority` : "Standard priority"}</small></div><div><span className="text-xs font-black uppercase tracking-wider text-muted-foreground lg:hidden">Follow-up</span><b className="mt-1 block text-sm capitalize">{reminder ? reminder.status.replaceAll("_", " ") : patient?.care_communications_consent ? "Not scheduled" : "No consent"}</b><small className="mt-1 block text-xs text-muted-foreground">{reminder?.next_run_at ? dateLabel(reminder.next_run_at) : patient?.phone ?? "No mobile number"}</small></div><div className="flex flex-wrap gap-2 lg:justify-end"><Link className={`${buttonBase} border border-border bg-white text-foreground`} href="/app/contacts">Open patient</Link>{canManage && !terminalStatuses.has(plan.status) ? <>{plan.status === "paused" ? <button className={`${buttonBase} border border-border bg-white text-foreground`} disabled={busyId === plan.id} onClick={() => updatePlan(plan.id, "active")}>Resume</button> : <button className={`${buttonBase} border border-border bg-white text-foreground`} disabled={busyId === plan.id} onClick={() => updatePlan(plan.id, "paused")}>Pause</button>}<button className={`${buttonBase} bg-emerald-600 text-white`} disabled={busyId === plan.id} onClick={() => updatePlan(plan.id, "completed")}><CheckCircle2 size={15}/>Complete</button></> : null}</div></article>;
      }) : <div className="grid min-h-48 place-items-center p-6 text-center"><ClipboardList className="mb-3 text-muted-foreground" size={32}/><p className="text-sm text-muted-foreground">No care plans match this view.</p></div>}</div>
    </section>
  </main>;
}
