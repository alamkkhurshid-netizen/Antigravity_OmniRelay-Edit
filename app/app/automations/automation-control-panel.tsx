"use client";

import { useState } from "react";

type Workflow = {
  id: string;
  name: string;
  trigger_key: string;
  status: string;
  max_attempts: number;
  timeout_seconds: number;
  last_run_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  configuration?: { execution_mode?: string; rollout?: string };
};

type Run = {
  id: string;
  workflow_id: string;
  trigger_key: string;
  status: string;
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string | null;
  started_at?: string | null;
  failure_summary: string | null;
  created_at: string;
  delivery_status?: string | null;
};

type RolloutReadiness = {
  workflow_id: string;
  trigger_key: string;
  observation_count: number;
  failure_count: number;
  required_observations: number;
  ready: boolean;
  review_status: "collecting" | "blocked" | "ready";
};

const MIN_OBSERVATIONS = 5;
const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const when = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(value))
    : "Never";

export function AutomationControlPanel({ workflows, runs, rolloutReadiness, nowIso }: { workflows: Workflow[]; runs: Run[]; rolloutReadiness: RolloutReadiness[]; nowIso: string }) {
  const [workflowRows, setWorkflowRows] = useState(workflows);
  const [runRows, setRunRows] = useState(runs);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [runView, setRunView] = useState<"all" | "attention">("all");
  const failed = runRows.filter((item) => item.status === "failed").length;
  const pending = runRows.filter((item) => ["queued", "retrying", "processing"].includes(item.status)).length;
  const now = new Date(nowIso).getTime();
  const stalled = runRows.filter((item) => item.status === "processing" && item.started_at && now - new Date(item.started_at).getTime() > 15 * 60_000);
  const delayed = runRows.filter((item) => ["queued", "retrying"].includes(item.status) && item.next_attempt_at && now - new Date(item.next_attempt_at).getTime() > 5 * 60_000);
  const attentionRuns = runRows.filter((item) => stalled.some((run) => run.id === item.id) || delayed.some((run) => run.id === item.id));
  const visibleRuns = runView === "attention" ? attentionRuns : runRows;
  const pilots = workflowRows.filter((item) => item.status === "active" && item.configuration?.execution_mode === "observe");

  function openAttentionRuns() {
    setRunView("attention");
    window.setTimeout(() => document.getElementById("automation-attention-runs")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
  }

  async function act(target: "workflow" | "run", id: string, action: string) {
    setBusy(id);
    setNotice("");
    const response = await fetch("/api/automation-control", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target, id, action }),
    });
    const result = (await response.json().catch(() => ({}))) as { workflow?: Workflow; run?: Run; error?: string };
    if (!response.ok) setNotice(result.error ?? "Automation control failed.");
    else if (result.workflow) setWorkflowRows((rows) => rows.map((row) => (row.id === id ? result.workflow! : row)));
    else if (result.run) setRunRows((rows) => rows.map((row) => (row.id === id ? result.run! : row)));
    setBusy("");
  }

  return (
    <section className="automation-control">
      <header>
        <div>
          <span className="app-eyebrow">AUTOMATION STATUS</span>
          <h2>Workflow health and recovery</h2>
          <p>Tenant-safe controls for clinic automations. Patient details are excluded from this ledger.</p>
        </div>
        <div className="automation-health">
          <b>{workflowRows.filter((item) => item.status === "active").length}</b><span>active</span>
          <b className={failed ? "danger" : ""}>{failed}</b><span>failed</span>
          {pending > 0 ? <button type="button" className="automation-queue-link" onClick={openAttentionRuns} aria-label={`View ${pending} queued automation ${pending === 1 ? "execution" : "executions"}`}><b>{pending}</b><span>in queue</span></button> : <><b>0</b><span>in queue</span></>}
        </div>
      </header>

      {stalled.length > 0 || delayed.length > 0 ? (
        <div className="automation-worker-alert" role="alert">
          <b>Worker attention required</b>
          <span>{stalled.length ? `${stalled.length} execution${stalled.length === 1 ? "" : "s"} running longer than 15 minutes` : ""}{stalled.length && delayed.length ? " · " : ""}{delayed.length ? `${delayed.length} queued execution${delayed.length === 1 ? "" : "s"} delayed by more than 5 minutes` : ""}</span>
          <button type="button" onClick={openAttentionRuns}>Review queued execution{attentionRuns.length === 1 ? "" : "s"} →</button>
        </div>
      ) : (
        <div className="automation-worker-ok" role="status"><b>Worker health normal</b><span>No stalled executions or overdue retries in this clinic workspace.</span></div>
      )}

      {pilots.length > 0 && (
        <div className="automation-rollout">
          <div className="automation-rollout-heading">
            <div><span className="app-eyebrow">AUTOMATION READINESS</span><h3>Monitored testing</h3></div>
            <p>Each workflow is monitored until it has at least {MIN_OBSERVATIONS} reliable deliveries and no recorded failures.</p>
          </div>
          <div className="automation-rollout-grid">
            {pilots.map((workflow) => {
              const assessment = rolloutReadiness.find((item) => item.workflow_id === workflow.id);
              const observations = Number(assessment?.observation_count ?? 0);
              const failures = Number(assessment?.failure_count ?? 0);
              const ready = assessment?.ready === true;
              return (
                <article key={workflow.id}>
                  <div><b>{label(workflow.trigger_key)}</b><span>{observations}/{assessment?.required_observations ?? MIN_OBSERVATIONS} observations · {failures} failures</span></div>
                  <i className={`automation-gate ${ready ? "ready" : failures ? "blocked" : "collecting"}`}>{ready ? "Ready to activate" : failures ? "Needs attention" : "In monitored testing"}</i>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {notice && <p className="care-error">{notice}</p>}
      <div className="automation-grid">
        <div className="automation-workflows">
          <h3>Workflows</h3>
          {workflowRows.length ? workflowRows.map((item) => (
            <article key={item.id}>
              <div><b>{item.name}</b><span>{label(item.trigger_key)} · {item.max_attempts} attempts · {item.timeout_seconds}s timeout</span><small>{item.configuration?.execution_mode === "observe" ? "Observe-only pilot · no additional patient message" : `Last success: ${when(item.last_success_at)}`}</small></div>
              <i className={`automation-state ${item.status}`}>{item.configuration?.execution_mode === "observe" ? "pilot" : item.status}</i>
              {item.status === "active" ? <button disabled={busy === item.id} onClick={() => act("workflow", item.id, "pause")}>Pause</button> : item.status === "paused" ? <button disabled={busy === item.id} onClick={() => act("workflow", item.id, "resume")}>Resume</button> : null}
            </article>
          )) : <div className="automation-empty">Workflows appear as clinic triggers are activated.</div>}
        </div>
        <div className="automation-runs" id="automation-attention-runs">
          <header><h3>{runView === "attention" ? "Queued execution requiring review" : "Recent executions"}</h3>{runView === "attention" && <button type="button" className="secondary automation-show-all" onClick={() => setRunView("all")}>Show all</button>}</header>
          {visibleRuns.length ? visibleRuns.slice(0, 12).map((item) => (
            <article key={item.id}>
              <div><b>{label(item.trigger_key)}</b><span>{when(item.created_at)} · attempt {item.attempt_count}/{item.max_attempts}{item.delivery_status ? ` · WhatsApp ${item.delivery_status}` : ""}</span>{item.failure_summary && <small>{item.failure_summary}</small>}{runView === "attention" && <small className="automation-review-note">No message has been sent by this queued run. Cancel removes it from the queue without sending.</small>}</div>
              <i className={`automation-state ${item.status}`}>{item.status}</i>
              <div>{item.status === "failed" && item.attempt_count < item.max_attempts ? <button disabled={busy === item.id} onClick={() => act("run", item.id, "retry")}>Retry</button> : null}{["queued", "retrying"].includes(item.status) ? <button className="secondary" disabled={busy === item.id} onClick={() => act("run", item.id, "cancel")}>Cancel</button> : null}</div>
            </article>
          )) : <div className="automation-empty">{runView === "attention" ? "No delayed executions are currently awaiting review." : "No executions yet. New clinic events will appear here."}</div>}
        </div>
      </div>
    </section>
  );
}
