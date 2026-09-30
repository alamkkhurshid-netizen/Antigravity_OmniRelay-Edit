"use client";

import { Patient, ReminderRun, TemplateReadiness } from "@/app/app/automations/types";
import { formatDate } from "@/app/app/automations/use-care-reminder-workspace";

interface CareDispatchPanelProps {
  whatsappConnected: boolean;
  approvedTemplates: TemplateReadiness[];
  runRows: ReminderRun[];
  patientMap: Map<string, Patient>;
  actOnRun: (id: string, action: "approve" | "retry" | "skip" | "acknowledge") => void;
}

export function CareDispatchPanel({
  whatsappConnected, approvedTemplates, runRows, patientMap, actOnRun
}: CareDispatchPanelProps) {
  return (
    <section className="care-dispatch-panel">
      <header>
        <div><span className="app-eyebrow">REMINDER OPERATIONS</span><h3>Approval and delivery queue</h3></div>
        <div className="dispatch-readiness">
          <span className={whatsappConnected ? "ready" : "blocked"}>{whatsappConnected ? "● WhatsApp connected" : "● WhatsApp connection required"}</span>
          <span className={approvedTemplates.length ? "ready" : "blocked"}>{approvedTemplates.length ? `${approvedTemplates.length} approved template${approvedTemplates.length === 1 ? "" : "s"}` : "Meta template approval required"}</span>
        </div>
      </header>
      {runRows.length === 0 ? (
        <div className="care-empty"><b>No reminder runs yet</b><span>Runs appear here when a scheduled care reminder becomes due.</span></div>
      ) : (
        <div className="dispatch-table">
          <div className="dispatch-table-head"><span>Patient / schedule</span><span>Channel</span><span>Status</span><span>Attempts</span><span>Action</span></div>
          {runRows.map((run) => {
            const patient = patientMap.get(run.patient_id);
            return (
              <article key={run.id}>
                <div><b>{patient?.full_name ?? "Patient"}</b><small>{formatDate(run.scheduled_for)}</small></div>
                <span>{run.channel}</span>
                <div>
                  <i className={`dispatch-status dispatch-status-${run.status}`}>{run.status}</i>
                  {run.response_kind && <small className={`adherence-response adherence-${run.response_kind}`}>
                    {run.response_kind === "confirmed" ? "✓ Taken" : run.response_kind === "missed" ? "! Skipped" : run.response_kind === "snoozed" ? "◷ Snoozed 15 min" : "! Patient requested help"}
                  </small>}
                  {run.response_text && <small>“{run.response_text}”</small>}
                  {run.failure_reason && <small>{run.failure_reason}</small>}
                </div>
                <span>{run.attempt_count} / {run.max_attempts}</span>
                <div className="dispatch-actions">
                  {run.status === "ready" && <button onClick={() => actOnRun(run.id, "approve")}>Approve</button>}
                  {run.status === "failed" && run.attempt_count < run.max_attempts && <button onClick={() => actOnRun(run.id, "retry")}>Retry</button>}
                  {["ready", "failed"].includes(run.status) && <button className="secondary" onClick={() => actOnRun(run.id, "skip")}>Skip</button>}
                  {["delivered", "read"].includes(run.status) && !run.acknowledged_at && <button onClick={() => actOnRun(run.id, "acknowledge")}>Record response</button>}
                  {run.acknowledged_at && <small className="dispatch-ack">✓ {run.response_kind ? "patient response recorded" : "acknowledged"}</small>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
