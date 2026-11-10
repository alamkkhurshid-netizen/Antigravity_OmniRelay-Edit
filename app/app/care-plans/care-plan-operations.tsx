"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { ArrowUpRight, CalendarClock, CheckCircle2, CircleAlert, ClipboardList, Search, UserRound } from "lucide-react";
import { WorkspaceHero } from "@/components/workspace-hero";

type PlanStatus = "active" | "paused" | "completed" | "cancelled";
type Plan = {
  id: string;
  patient_id: string;
  plan_type: string;
  title: string;
  goal: string | null;
  instructions: string | null;
  status: PlanStatus;
  starts_on: string;
  target_date: string | null;
  next_review_at: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
};
type Patient = {
  id: string;
  full_name: string;
  phone: string;
  health_concern: string | null;
  care_communications_consent: boolean;
  last_seen_at: string;
};
type Reminder = {
  id: string;
  care_plan_id: string;
  status: string;
  next_run_at: string | null;
  last_run_at: string | null;
};
type Task = {
  id: string;
  care_plan_id: string;
  status: string;
  due_at: string | null;
  priority: string;
  assigned_to: string | null;
};
type Staff = {
  user_id: string | null;
  name: string;
};
type Filter = "attention" | "active" | "paused" | "completed" | "all";

const terminalStatuses = new Set<PlanStatus>(["completed", "cancelled"]);
const failedReminderStatuses = new Set(["failed", "blocked", "cancelled"]);

function dateLabel(value: string | null) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

export function CarePlanOperations({
  plans: initialPlans,
  patients,
  reminders,
  tasks,
  staff,
  canManage,
  nowIso,
}: {
  plans: Plan[];
  patients: Patient[];
  reminders: Reminder[];
  tasks: Task[];
  staff: Staff[];
  canManage: boolean;
  nowIso: string;
}) {
  const [plans, setPlans] = useState(initialPlans);
  const [filter, setFilter] = useState<Filter>("attention");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const now = new Date(nowIso).getTime();
  const sevenDays = now + 7 * 24 * 60 * 60 * 1000;
  const patientMap = useMemo(() => new Map(patients.map((patient) => [patient.id, patient])), [patients]);
  const staffMap = useMemo(
    () => new Map(staff.filter((member) => member.user_id).map((member) => [member.user_id as string, member.name])),
    [staff]
  );
  const reminderMap = useMemo(
    () => new Map(reminders.map((reminder) => [reminder.care_plan_id, reminder])),
    [reminders]
  );
  const taskMap = useMemo(() => new Map(tasks.map((task) => [task.care_plan_id, task])), [tasks]);

  const metrics = useMemo(() => {
    let active = 0,
      dueSoon = 0,
      overdue = 0,
      failed = 0;
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

  const visiblePlans = useMemo(() => {
    return plans.filter((plan) => {
      const patient = patientMap.get(plan.patient_id);
      const reviewAt = plan.next_review_at ? new Date(plan.next_review_at).getTime() : null;
      const reminder = reminderMap.get(plan.id);
      const attention =
        !terminalStatuses.has(plan.status) &&
        (!reviewAt || reviewAt <= sevenDays || Boolean(reminder && failedReminderStatuses.has(reminder.status)));
      const matchesFilter = filter === "all" || (filter === "attention" ? attention : plan.status === filter);
      const searchable = `${plan.title} ${plan.plan_type} ${patient?.full_name ?? ""} ${patient?.phone ?? ""} ${
        patient?.health_concern ?? ""
      }`.toLowerCase();
      return matchesFilter && (!deferredQuery || searchable.includes(deferredQuery));
    });
  }, [plans, filter, deferredQuery, patientMap, reminderMap, sevenDays]);

  async function updatePlan(id: string, status: PlanStatus) {
    setBusyId(id);
    setMessage("");
    const response = await fetch("/api/patients/care-plans", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    const result = await response.json();
    setBusyId(null);
    if (!response.ok || !result.plan) {
      setMessage(result.error ?? "Care plan could not be updated.");
      return;
    }
    setPlans((current) => current.map((plan) => (plan.id === id ? result.plan : plan)));
    setMessage(
      status === "completed"
        ? "Care plan and linked follow-ups completed."
        : status === "paused"
        ? "Care plan and linked follow-ups paused."
        : "Care plan reactivated."
    );
  }

  const buttonBase =
    "inline-flex h-7.5 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-bold shadow-2xs transition disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <main className="mx-auto grid max-w-7xl gap-4 pb-12">
      <WorkspaceHero
        tag="CONTINUED CARE OPERATIONS"
        title="Every follow-up, visible and owned."
        subtitle="Review active patient plans across the clinic, prioritize overdue work and catch reminder failures before a patient is missed."
        action={
          <div className="flex flex-wrap items-center gap-3 z-10">
            <Link
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-teal-400 to-blue-500 px-3.5 text-xs font-bold text-slate-950 shadow-[0_0_20px_rgba(45,212,191,0.25)] transition-all hover:from-teal-300 hover:to-blue-400 hover:scale-[1.02]"
              href="/app/contacts"
            >
              Create plan <ArrowUpRight size={14} />
            </Link>
          </div>
        }
      />

      {/* High-Density 4-Column Stat Cards */}
      <section className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4" aria-label="Care plan summary">
        {[
          {
            label: "Active plans",
            value: metrics.active,
            detail: "Continued-care journeys",
            icon: ClipboardList,
            tone: "text-teal-700 bg-teal-50 border border-teal-200/50",
          },
          {
            label: "Due in 7 days",
            value: metrics.dueSoon,
            detail: "Reviews approaching",
            icon: CalendarClock,
            tone: "text-amber-800 bg-amber-50 border border-amber-200/50",
          },
          {
            label: "Overdue",
            value: metrics.overdue,
            detail: "Requires staff action",
            icon: CircleAlert,
            tone: "text-rose-800 bg-rose-50 border border-rose-200/50",
          },
          {
            label: "Reminder issues",
            value: metrics.failed,
            detail: "Blocked or failed outreach",
            icon: CircleAlert,
            tone: "text-rose-800 bg-rose-50 border border-rose-200/50",
          },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <article
              className="or-trademark-card flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs transition hover:border-slate-300"
              key={item.label}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-900">{item.label}</span>
                <span className={`grid size-7 place-items-center rounded-lg ${item.tone}`}>
                  <Icon size={15} />
                </span>
              </div>
              <div className="mt-2.5">
                <b className="block text-2xl font-bold tracking-tight text-slate-900">{item.value}</b>
                <span className="mt-0.5 block text-[11px] font-medium text-slate-600">{item.detail}</span>
              </div>
            </article>
          );
        })}
      </section>

      {message && (
        <p className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-xs font-semibold text-emerald-800" role="status">
          {message}
        </p>
      )}

      {/* High-Density Clinic Queue */}
      <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-2xs">
        <header className="flex flex-col gap-3 border-b border-slate-200/80 bg-slate-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-800">CLINIC QUEUE</span>
            <h2 className="mt-0.5 text-sm font-bold text-slate-900 leading-snug">Care-plan reviews</h2>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="flex h-8 min-w-56 items-center gap-2 rounded-lg border border-slate-200/80 bg-white px-2.5 shadow-2xs">
              <Search size={14} className="text-slate-500 shrink-0" />
              <span className="sr-only">Search care plans</span>
              <input
                className="w-full bg-transparent text-xs font-medium text-slate-900 outline-none placeholder:text-slate-600"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search patient or plan"
              />
            </label>

            <div className="flex max-w-full gap-0.5 overflow-x-auto rounded-lg bg-slate-100 p-0.5" aria-label="Filter care plans">
              {(["attention", "active", "paused", "completed", "all"] as Filter[]).map((item) => (
                <button
                  className={`whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-bold transition ${
                    filter === item
                      ? "bg-white text-slate-900 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                  key={item}
                  onClick={() => setFilter(item)}
                >
                  {item === "attention" ? "Needs attention" : item[0].toUpperCase() + item.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </header>

        <div role="table" aria-label="Care plans">
          <div
            className="hidden grid-cols-[minmax(230px,1.7fr)_minmax(145px,1fr)_minmax(125px,.8fr)_minmax(155px,1fr)_auto] gap-4 border-b border-slate-200/80 bg-slate-50/80 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-700 lg:grid"
            role="row"
          >
            <span>Patient and plan</span>
            <span>Review</span>
            <span>Owner</span>
            <span>Follow-up</span>
            <span className="text-right">Action</span>
          </div>

          {visiblePlans.length ? (
            visiblePlans.map((plan) => {
              const patient = patientMap.get(plan.patient_id);
              const reminder = reminderMap.get(plan.id);
              const task = taskMap.get(plan.id);
              const reviewAt = plan.next_review_at ? new Date(plan.next_review_at).getTime() : null;
              const overdue = Boolean(reviewAt && reviewAt < now && !terminalStatuses.has(plan.status));
              const dueSoon = Boolean(reviewAt && reviewAt >= now && reviewAt <= sevenDays && !terminalStatuses.has(plan.status));
              const reviewStatus = overdue ? "Overdue" : dueSoon ? "Due soon" : plan.status;

              return (
                <article
                  className="grid gap-3.5 border-b border-slate-100 p-3.5 px-4 last:border-b-0 transition hover:bg-slate-50/40 lg:grid-cols-[minmax(230px,1.7fr)_minmax(145px,1fr)_minmax(125px,.8fr)_minmax(155px,1fr)_auto] lg:items-center"
                  role="row"
                  key={plan.id}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700 border border-teal-200/50">
                        <UserRound size={14} />
                      </span>
                      <span className="text-xs font-bold text-slate-900">{patient?.full_name ?? "Patient"}</span>
                    </div>
                    <span className="mt-1.5 block text-xs font-semibold text-slate-800 leading-snug">{plan.title}</span>
                    <span className="mt-0.5 block text-[11px] font-medium text-slate-600">
                      {plan.plan_type.replaceAll("_", " ")}
                      {patient?.health_concern ? ` · ${patient.health_concern}` : ""}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 lg:hidden">Review</span>
                    <b className="mt-1 block text-xs font-bold text-slate-900">{dateLabel(plan.next_review_at)}</b>
                    <span
                      className={`mt-1.5 inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold ${
                        overdue
                          ? "bg-rose-50 text-rose-800 border border-rose-200"
                          : dueSoon
                          ? "bg-amber-50 text-amber-800 border border-amber-200"
                          : "bg-slate-100 text-slate-700 border border-slate-200/60"
                      }`}
                    >
                      {reviewStatus}
                    </span>
                    {task ? (
                      <span className="mt-1 block text-[11px] font-medium text-slate-600">
                        Task: {task.status.replaceAll("_", " ")}
                      </span>
                    ) : null}
                  </div>

                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 lg:hidden">Owner</span>
                    <b className="mt-1 block text-xs font-bold text-slate-900">
                      {plan.assigned_to ? staffMap.get(plan.assigned_to) ?? "Assigned staff" : "Clinic queue"}
                    </b>
                    <span className="mt-0.5 block text-[11px] font-medium text-slate-600">
                      {task?.priority ? `${task.priority} priority` : "Standard priority"}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 lg:hidden">Follow-up</span>
                    <b className="mt-1 block text-xs font-bold text-slate-900 capitalize">
                      {reminder
                        ? reminder.status.replaceAll("_", " ")
                        : patient?.care_communications_consent
                        ? "Not scheduled"
                        : "No consent"}
                    </b>
                    <span className="mt-0.5 block text-[11px] font-medium text-slate-600 truncate">
                      {reminder?.next_run_at ? dateLabel(reminder.next_run_at) : patient?.phone ?? "No mobile number"}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 lg:justify-end">
                    <Link
                      className={`${buttonBase} border border-slate-200/80 bg-white text-slate-700 hover:bg-slate-50`}
                      href="/app/contacts"
                    >
                      Open patient
                    </Link>

                    {canManage && !terminalStatuses.has(plan.status) ? (
                      <>
                        {plan.status === "paused" ? (
                          <button
                            className={`${buttonBase} border border-slate-200/80 bg-white text-slate-700 hover:bg-slate-50`}
                            disabled={busyId === plan.id}
                            onClick={() => updatePlan(plan.id, "active")}
                          >
                            Resume
                          </button>
                        ) : (
                          <button
                            className={`${buttonBase} border border-slate-200/80 bg-white text-slate-700 hover:bg-slate-50`}
                            disabled={busyId === plan.id}
                            onClick={() => updatePlan(plan.id, "paused")}
                          >
                            Pause
                          </button>
                        )}
                        <button
                          className={`${buttonBase} bg-emerald-600 text-white hover:bg-emerald-700`}
                          disabled={busyId === plan.id}
                          onClick={() => updatePlan(plan.id, "completed")}
                        >
                          <CheckCircle2 size={13} />
                          Complete
                        </button>
                      </>
                    ) : null}
                  </div>
                </article>
              );
            })
          ) : (
            <div className="grid min-h-40 place-items-center p-6 text-center">
              <ClipboardList className="mb-2 text-slate-400" size={28} />
              <p className="text-xs font-medium text-slate-600">No care plans match this view.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}