"use client";

import { useState } from "react";

export type ManualCheck = { check_key: string; status: string; notes: string | null; evidence_at: string | null; updated_at: string };
export type LifecycleEvidence = { completedVisits: number; carePlanHandoffs: number; ownedFollowUps: number; reminderOutcomes: number; closedJourneys: number };
export type ReadinessAuditEvent = { id: string; event_type: string; summary: string; metadata: { status?: string; pilot_closeout_status?: string } | null; created_at: string };

export const readinessDefinitions = [
  { key: "backup_export", title: "Encrypted data export", detail: "Record where the latest off-site database export is stored and who can restore it." },
  { key: "restore_drill", title: "Restore drill", detail: "Restore a non-production copy and verify patient, appointment and consent records." },
  { key: "pilot_booking", title: "Booking to confirmed visit", detail: "Record one controlled booking, approval or confirmation, and a completed appointment outcome." },
  { key: "pilot_care_plan", title: "Visit to care plan", detail: "Record that the completed visit produced the intended care plan, task or prescription handoff." },
  { key: "pilot_follow_up", title: "Follow-up ownership", detail: "Record one dated follow-up and the named staff member accountable for it." },
  { key: "pilot_reminder", title: "Reminder outcome", detail: "Record one consented follow-up or medication reminder result without copying patient identity here." },
  { key: "pilot_signoff", title: "Clinic pilot sign-off", detail: "Confirm the named pilot clinic completed the controlled booking-to-follow-up lifecycle." },
];

export function ReadinessWorkspace({ initialChecks, lifecycleEvidence, evidenceHistory }: { initialChecks: ManualCheck[]; lifecycleEvidence: LifecycleEvidence; evidenceHistory: ReadinessAuditEvent[] }) {
  const [checks, setChecks] = useState(initialChecks);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  async function save(checkKey: string, status: string, notes: string) {
    setBusy(checkKey); setNotice("");
    const response = await fetch("/api/readiness", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ checkKey, status, notes }) });
    const result = await response.json().catch(() => ({})) as { check?: ManualCheck; error?: string };
    if (!response.ok || !result.check) setNotice(result.error ?? "Readiness evidence could not be saved.");
    else {
      setChecks((current) => [...current.filter((item) => item.check_key !== checkKey), result.check!]);
      setNotice("Readiness evidence saved with the responsible team member and time.");
    }
    setBusy("");
  }

  return <><section className={`readiness-lifecycle-evidence ${lifecycleEvidence.closedJourneys ? "ready" : "pending"}`}><header><div><span className="app-eyebrow">AUTOMATIC LIFECYCLE EVIDENCE</span><h3>{lifecycleEvidence.closedJourneys ? "A complete clinic journey is recorded" : "Waiting for one complete clinic journey"}</h3></div><strong>{lifecycleEvidence.closedJourneys}</strong></header><p>Counts are tenant-scoped operational evidence only. No patient name, phone number, diagnosis, or reminder content is shown here.</p><div><article><b>{lifecycleEvidence.completedVisits}</b><span>completed visits</span></article><article><b>{lifecycleEvidence.carePlanHandoffs}</b><span>care-plan handoffs</span></article><article><b>{lifecycleEvidence.ownedFollowUps}</b><span>named follow-ups</span></article><article><b>{lifecycleEvidence.reminderOutcomes}</b><span>reminder outcomes</span></article></div></section><section className="readiness-manual"><header><div><span className="app-eyebrow">OWNER EVIDENCE</span><h3>Close the controlled clinic-pilot lifecycle</h3></div><span>{checks.filter((item) => item.status === "ready").length}/{readinessDefinitions.length} ready</span></header>
    <p className="readiness-guide">Use synthetic details where possible. Evidence notes must name the workflow and owner, never a patient or clinical detail.</p>
    <div>{readinessDefinitions.map((definition) => { const current = checks.find((item) => item.check_key === definition.key); const signoffBlocked = definition.key === "pilot_signoff" && readinessDefinitions.filter((item) => item.key !== "pilot_signoff").some((item) => checks.find((check) => check.check_key === item.key)?.status !== "ready"); return <ReadinessCheck key={definition.key} definition={definition} current={current} busy={busy === definition.key} signoffBlocked={signoffBlocked} onSave={save}/>; })}</div>
    {notice && <p className="readiness-notice" role="status">{notice}</p>}
  </section>{evidenceHistory.length > 0 && <section className="readiness-history"><header><div><span className="app-eyebrow">EVIDENCE TIMELINE</span><h3>Recent readiness decisions</h3></div><span>Administrator audit trail</span></header><p>Safe operational summaries only. Patient identity and clinical details are excluded.</p><div>{evidenceHistory.map((event) => <article key={event.id}><i>{event.metadata?.status === "ready" ? "✓" : event.metadata?.status === "blocked" ? "!" : "○"}</i><span><b>{event.summary}</b><small>{new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(event.created_at))}</small></span><em>{event.metadata?.status ?? "updated"}</em></article>)}</div></section>}</>;
}

function ReadinessCheck({ definition, current, busy, signoffBlocked, onSave }: { definition: { key: string; title: string; detail: string }; current?: ManualCheck; busy: boolean; signoffBlocked: boolean; onSave: (key: string, status: string, notes: string) => Promise<void> }) {
  const [status, setStatus] = useState(current?.status ?? "pending");
  const [notes, setNotes] = useState(current?.notes ?? "");
  return <article className={`manual-check ${status}`}><div><i>{status === "ready" ? "✓" : status === "blocked" ? "!" : "○"}</i><span><b>{definition.title}</b><small>{definition.detail}</small>{definition.key === "pilot_signoff" && signoffBlocked && <small className="manual-check-warning">Close the six preceding pilot evidence gates before final sign-off.</small>}{current?.evidence_at && <time>Evidence recorded {new Date(current.evidence_at).toLocaleString("en-IN")}</time>}</span></div><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="pending">Pending</option><option value="ready" disabled={definition.key === "pilot_signoff" && signoffBlocked}>Ready</option><option value="blocked">Blocked</option></select></label><label>Evidence note<input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Location, date, owner or blocker" maxLength={500}/></label><button type="button" disabled={busy || (status !== "pending" && notes.trim().length < 3) || (definition.key === "pilot_signoff" && status === "ready" && signoffBlocked)} onClick={() => void onSave(definition.key, status, notes)}>{busy ? "Saving…" : "Save evidence"}</button></article>;
}
