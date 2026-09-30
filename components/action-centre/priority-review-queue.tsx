"use client";

import Link from "next/link";
import { ArrowUpRight, CheckCircle2, UserRoundCheck } from "lucide-react";
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
}

export function PriorityReviewQueue({
  exceptions, currentUserId, working, notice, error, buttonBase,
  resolveDraft, coordinate, updateTask, retry
}: PriorityReviewQueueProps) {
  return (
    <section id="priority-review-queue" className="sandbox-step-queue scroll-mt-6 overflow-hidden rounded-2xl border border-border bg-white shadow-[0_12px_36px_rgba(7,19,38,.06)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
        <div>
          <span className="text-xs font-black tracking-[.1em] text-slate-500">PRIORITIZED CLINIC QUEUE</span>
          <h2 className="text-lg font-bold text-slate-900 mt-1">Approvals, waitlists and exceptions</h2>
        </div>
        <span className="rounded-full bg-rose-50 px-3 py-1 text-sm font-bold text-rose-700">{exceptions.length} items</span>
      </header>
      
      {notice && <p className="m-5 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-800" role="status">{notice}</p>}
      {error && <p className="m-5 rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-800" role="alert">{error}</p>}
      
      {exceptions.length === 0 ? (
        <div className="grid min-h-48 place-items-center p-6 text-center">
          <CheckCircle2 className="mb-3 text-emerald-600" size={32}/>
          <b>No cases need manual review</b>
          <span className="mt-1 text-sm text-muted-foreground">Routine actions can continue without clinic administration.</span>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {exceptions.slice(0, 30).map(item => {
            const claimedByYou = item.assignment?.assigned_to === currentUserId;
            const claimedByOther = !!item.assignment?.assigned_to && !claimedByYou;
            return (
              <article className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start" key={`${item.type}-${item.id}`}>
                <span className={`grid size-10 shrink-0 place-items-center rounded-xl font-black ${item.priority === "urgent" ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-700"}`}>
                  {item.priority === "urgent" ? "!!" : "!"}
                </span>
                <div className="min-w-0 flex-1">
                  <b className="block text-sm">{item.name} <span className="font-normal text-muted-foreground">· {item.type}</span></b>
                  <span className="mt-1 block whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{item.detail}</span>
                  <small className="mt-2 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    <UserRoundCheck size={13}/>
                    {item.kind === "agent_draft" ? "AI Generated Draft" : claimedByYou ? "Owned by you" : claimedByOther ? "Owned by another administrator" : "Unassigned"}
                    {item.assignment?.status === "reviewed" ? " · review recorded" : ""}
                  </small>
                </div>
                <nav className="flex flex-wrap gap-2 sm:justify-end">
                  {item.kind === "agent_draft" ? (
                    <>
                      <button className={`${buttonBase} bg-emerald-600 text-white hover:bg-emerald-700`} type="button" onClick={() => resolveDraft(item,"approve")} disabled={working === item.id}>
                        {working === item.id ? "Approving…" : "Approve"}
                      </button>
                      <button className={`sandbox-step-discuss ${buttonBase} border border-border bg-white text-blue-600 hover:bg-blue-50`} type="button" onClick={() => resolveDraft(item,"edit")} disabled={working === item.id}>
                        Discuss / Refine
                      </button>
                      <button className={`${buttonBase} border border-border bg-white text-rose-600 hover:bg-rose-50`} type="button" onClick={() => resolveDraft(item,"reject")} disabled={working === item.id}>
                        Reject & Train
                      </button>
                    </>
                  ) : item.kind === "care_task" ? (
                    <>
                      {!claimedByYou && !claimedByOther && (
                        <button className={`${buttonBase} border border-border bg-white text-foreground`} type="button" onClick={() => coordinate(item,"claim")} disabled={working === item.id}>
                          {working === item.id ? "Claiming…" : "Claim follow-up"}
                        </button>
                      )}
                      {claimedByYou && item.status === "open" && (
                        <button className={`${buttonBase} border border-border bg-white text-foreground`} type="button" onClick={() => updateTask(item,"in_progress")} disabled={working === item.id}>
                          Start follow-up
                        </button>
                      )}
                      {claimedByYou && (
                        <button className={`${buttonBase} bg-emerald-600 text-white`} type="button" onClick={() => updateTask(item,"completed")} disabled={working === item.id}>
                          {working === item.id ? "Saving…" : "Complete"}
                        </button>
                      )}
                      {claimedByYou && (
                        <button className={`${buttonBase} border border-border bg-white text-foreground`} type="button" onClick={() => coordinate(item,"release")} disabled={working === item.id}>
                          Release
                        </button>
                      )}
                      <Link className={`${buttonBase} bg-primary text-primary-foreground`} href={item.href}>
                        Open <ArrowUpRight size={15}/>
                      </Link>
                    </>
                  ) : item.kind === "care_retry" || item.kind === "appointment_retry" ? (
                    <button className={`${buttonBase} bg-primary text-primary-foreground`} type="button" onClick={() => retry(item)} disabled={working === item.id}>
                      {working === item.id ? "Releasing…" : "Review & retry"}
                    </button>
                  ) : (
                    <>
                      <button className={`${buttonBase} border border-border bg-white text-foreground`} type="button" onClick={() => coordinate(item,item.assignment?.assigned_to === currentUserId ? "review" : "claim")} disabled={working === item.id || item.kind === "blocked"}>
                        {item.assignment?.assigned_to === currentUserId ? "Mark reviewed" : "Claim"}
                      </button>
                      <Link className={`${buttonBase} bg-primary text-primary-foreground`} href={item.href}>
                        Open <ArrowUpRight size={15}/>
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
