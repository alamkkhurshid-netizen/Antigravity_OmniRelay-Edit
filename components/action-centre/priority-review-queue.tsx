"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ArrowUpRight, CheckCircle2, ShieldAlert, Sparkles, UserRoundCheck } from "lucide-react";
import { ExceptionItem } from "@/app/app/action-centre/types";

interface PriorityReviewQueueProps {
  exceptions: ExceptionItem[];
  currentUserId: string;
  working: string | null;
  notice: string;
  error: string;
  buttonBase: string;
  resolveDraft: (item: ExceptionItem, action: "approve"|"reject"|"edit") => void;
  coordinate: (item: ExceptionItem, action: "claim"|"review"|"release") => void;
  updateTask: (item: ExceptionItem, status: "in_progress"|"completed") => void;
  retry: (item: ExceptionItem) => void;
  resolveCarrierRecovery?: (item: ExceptionItem, action: "resolve" | "retry") => void;
}

export function PriorityReviewQueue({
  exceptions, currentUserId, working, notice, error, buttonBase,
  resolveDraft, coordinate, updateTask, retry, resolveCarrierRecovery
}: PriorityReviewQueueProps) {
  const [activeTab, setActiveTab] = useState<"all" | "draft" | "booking" | "task" | "system">("all");

  const tabCounts = useMemo(() => ({
    all: exceptions.length,
    draft: exceptions.filter(e => e.kind === "agent_draft").length,
    booking: exceptions.filter(e => e.kind === "booking_approval" || e.kind === "waitlist" || e.kind === "schedule_disruption").length,
    task: exceptions.filter(e => e.kind === "care_task").length,
    system: exceptions.filter(e => e.kind === "blocked" || e.kind === "carrier_recovery" || e.kind === "care_retry" || e.kind === "appointment_retry").length,
  }), [exceptions]);

  const filteredExceptions = useMemo(() => {
    if (activeTab === "all") return exceptions;
    if (activeTab === "draft") return exceptions.filter(e => e.kind === "agent_draft");
    if (activeTab === "booking") return exceptions.filter(e => e.kind === "booking_approval" || e.kind === "waitlist" || e.kind === "schedule_disruption");
    if (activeTab === "task") return exceptions.filter(e => e.kind === "care_task");
    if (activeTab === "system") return exceptions.filter(e => e.kind === "blocked" || e.kind === "carrier_recovery" || e.kind === "care_retry" || e.kind === "appointment_retry");
    return exceptions;
  }, [exceptions, activeTab]);

  return (
    <section id="priority-review-queue" className="sandbox-step-queue scroll-mt-6 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-2xs">
      {/* Header */}
      <header className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700">PRIORITIZED CLINIC QUEUE</span>
          <h2 className="or-type-section mt-2">Approvals, waitlists and exceptions</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-700 border border-rose-200/60">
            <span className="size-1.5 rounded-full bg-rose-500 animate-pulse" />
            {exceptions.length} items
          </span>
        </div>
      </header>

      {/* Linear-Style Filter Tabs */}
      {exceptions.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-100 bg-slate-50/50 px-3 py-1.5 text-xs">
          <button
            type="button"
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
              activeTab === "all" ? "bg-white text-slate-900 shadow-2xs border border-slate-200" : "text-slate-500 hover:text-slate-800"
            }`}
            onClick={() => setActiveTab("all")}
          >
            All <span className="text-[10px] opacity-70">({tabCounts.all})</span>
          </button>
          {tabCounts.draft > 0 && (
            <button
              type="button"
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                activeTab === "draft" ? "bg-white text-slate-900 shadow-2xs border border-slate-200" : "text-slate-500 hover:text-slate-800"
              }`}
              onClick={() => setActiveTab("draft")}
            >
              <Sparkles className="size-3 text-teal-600" />
              AI Drafts <span className="text-[10px] opacity-70">({tabCounts.draft})</span>
            </button>
          )}
          {tabCounts.booking > 0 && (
            <button
              type="button"
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                activeTab === "booking" ? "bg-white text-slate-900 shadow-2xs border border-slate-200" : "text-slate-500 hover:text-slate-800"
              }`}
              onClick={() => setActiveTab("booking")}
            >
              Bookings & Waitlist <span className="text-[10px] opacity-70">({tabCounts.booking})</span>
            </button>
          )}
          {tabCounts.task > 0 && (
            <button
              type="button"
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                activeTab === "task" ? "bg-white text-slate-900 shadow-2xs border border-slate-200" : "text-slate-500 hover:text-slate-800"
              }`}
              onClick={() => setActiveTab("task")}
            >
              Care Tasks <span className="text-[10px] opacity-70">({tabCounts.task})</span>
            </button>
          )}
          {tabCounts.system > 0 && (
            <button
              type="button"
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                activeTab === "system" ? "bg-white text-slate-900 shadow-2xs border border-slate-200" : "text-slate-500 hover:text-slate-800"
              }`}
              onClick={() => setActiveTab("system")}
            >
              Launch & Carrier <span className="text-[10px] opacity-70">({tabCounts.system})</span>
            </button>
          )}
        </div>
      )}
      
      {notice && <p className="m-3 rounded-lg border border-emerald-200 bg-emerald-50/70 p-2.5 text-xs font-semibold text-emerald-800" role="status">{notice}</p>}
      {error && <p className="m-3 rounded-lg border border-rose-200 bg-rose-50/70 p-2.5 text-xs font-semibold text-rose-800" role="alert">{error}</p>}
      
      {exceptions.length === 0 ? (
        <div className="grid min-h-40 place-items-center p-6 text-center">
          <CheckCircle2 className="mb-2 text-emerald-600" size={28}/>
          <b className="text-sm font-bold text-slate-900">No cases need manual review</b>
          <span className="mt-0.5 text-xs text-slate-500">Routine actions can continue without clinic administration.</span>
        </div>
      ) : filteredExceptions.length === 0 ? (
        <div className="p-6 text-center text-xs text-slate-500">
          No items match this category filter.
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {filteredExceptions.slice(0, 30).map(item => {
            const claimedByYou = item.assignment?.assigned_to === currentUserId;
            const claimedByOther = !!item.assignment?.assigned_to && !claimedByYou;
            return (
              <article className="group flex flex-col gap-3 p-3.5 transition hover:bg-slate-50/70 sm:flex-row sm:items-start" key={`${item.type}-${item.id}`}>
                {/* Priority Badge */}
                <span className={`inline-flex shrink-0 items-center justify-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${
                  item.priority === "urgent" ? "bg-rose-50 text-rose-700 border-rose-200/60" : "bg-amber-50 text-amber-700 border-amber-200/60"
                }`}>
                  {item.priority === "urgent" ? "Urgent" : "Review"}
                </span>

                {/* Details */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <b className="text-xs font-bold text-slate-900">{item.name}</b>
                    <span className="text-[11px] font-medium text-slate-400">· {item.type}</span>
                  </div>
                  <span className="mt-0.5 block whitespace-pre-wrap text-xs leading-relaxed text-slate-600">{item.detail}</span>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold border ${
                      claimedByYou
                        ? "bg-teal-50 text-teal-700 border-teal-200/60"
                        : claimedByOther
                        ? "bg-slate-100 text-slate-600 border-slate-200/60"
                        : "bg-slate-50 text-slate-500 border-slate-200/40"
                    }`}>
                      <UserRoundCheck size={11}/>
                      {item.kind === "agent_draft" ? "AI Generated Draft" : claimedByYou ? "Owned by you" : claimedByOther ? "Owned by another administrator" : "Unassigned"}
                      {item.assignment?.status === "reviewed" ? " · review recorded" : ""}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <nav className="flex flex-wrap items-center gap-1.5 sm:justify-end shrink-0">
                  {item.kind === "agent_draft" ? (
                    <>
                      <button className={`${buttonBase} bg-emerald-600 text-white hover:bg-emerald-700`} type="button" onClick={() => resolveDraft(item,"approve")} disabled={working === item.id}>
                        {working === item.id ? "Approving…" : "Approve"}
                      </button>
                      <button className={`sandbox-step-discuss ${buttonBase} border border-slate-200 bg-white text-teal-700 hover:bg-slate-50`} type="button" onClick={() => resolveDraft(item,"edit")} disabled={working === item.id}>
                        Discuss / Refine
                      </button>
                      <button className={`${buttonBase} border border-slate-200 bg-white text-rose-600 hover:bg-rose-50`} type="button" onClick={() => resolveDraft(item,"reject")} disabled={working === item.id}>
                        Reject & Train
                      </button>
                    </>
                  ) : item.kind === "care_task" ? (
                    <>
                      {!claimedByYou && !claimedByOther && (
                        <button className={`${buttonBase} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`} type="button" onClick={() => coordinate(item,"claim")} disabled={working === item.id}>
                          {working === item.id ? "Claiming…" : "Claim follow-up"}
                        </button>
                      )}
                      {claimedByYou && item.status === "open" && (
                        <button className={`${buttonBase} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`} type="button" onClick={() => updateTask(item,"in_progress")} disabled={working === item.id}>
                          Start follow-up
                        </button>
                      )}
                      {claimedByYou&&<button className={`${buttonBase} bg-emerald-600 text-white`} type="button" onClick={() => updateTask(item,"completed")} disabled={working === item.id}>
                          {working === item.id ? "Saving…" : "Complete"}
                        </button>}
                      {claimedByYou && (
                        <button className={`${buttonBase} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`} type="button" onClick={() => coordinate(item,"release")} disabled={working === item.id}>
                          Release
                        </button>
                      )}
                      <Link className={`${buttonBase} bg-slate-900 text-white hover:bg-slate-800`} href={item.href}>
                        Open <ArrowUpRight size={13}/>
                      </Link>
                    </>
                  ) : item.kind === "carrier_recovery" ? (
                    <>
                      {!claimedByYou && !claimedByOther && (
                        <button className={`${buttonBase} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`} type="button" onClick={() => coordinate(item, "claim")} disabled={working === item.id}>
                          {working === item.id ? "Claiming…" : "Claim recovery task"}
                        </button>
                      )}
                      {claimedByYou && (
                        <>
                          <button className={`${buttonBase} bg-emerald-600 text-white hover:bg-emerald-700`} type="button" onClick={() => resolveCarrierRecovery?.(item, "resolve")} disabled={working === item.id}>
                            {working === item.id ? "Saving…" : "Mark contacted & resolve"}
                          </button>
                          <button className={`${buttonBase} border border-slate-200 bg-white text-teal-700 hover:bg-slate-50`} type="button" onClick={() => resolveCarrierRecovery?.(item, "retry")} disabled={working === item.id}>
                            Queue retry
                          </button>
                          <button className={`${buttonBase} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`} type="button" onClick={() => coordinate(item, "release")} disabled={working === item.id}>
                            Release
                          </button>
                        </>
                      )}
                      {claimedByOther && (
                        <span className="self-center text-xs italic text-slate-400">Claimed by colleague</span>
                      )}
                    </>
                  ) : item.kind === "care_retry" || item.kind === "appointment_retry" ? (
                    <button className={`${buttonBase} bg-slate-900 text-white hover:bg-slate-800`} type="button" onClick={() => retry(item)} disabled={working === item.id}>
                      {working === item.id ? "Releasing…" : "Review & retry"}
                    </button>
                  ) : (
                    <>
                      <button className={`${buttonBase} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`} type="button" onClick={() => coordinate(item,item.assignment?.assigned_to === currentUserId ? "review" : "claim")} disabled={working === item.id || item.kind === "blocked"}>
                        {item.assignment?.assigned_to === currentUserId ? "Mark reviewed" : "Claim"}
                      </button>
                      <Link className={`${buttonBase} bg-slate-900 text-white hover:bg-slate-800`} href={item.href}>
                        Open <ArrowUpRight size={13}/>
                      </Link>
                    </>
                  )}
                </nav>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
