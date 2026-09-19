"use client";

import { useState } from "react";

export type RecoverableIncident = {
  id: string;
  kind: "appointment_reminder" | "care_reminder";
  title: string;
  detail: string;
  at: string;
};

export type RecoveryAuditItem = {
  id: string;
  job_kind: "appointment_reminder" | "care_reminder";
  reason: string;
  created_at: string;
};

export function RecoveryActions({ incidents, recoveries }: { incidents: RecoverableIncident[]; recoveries: RecoveryAuditItem[] }) {
  const [working, setWorking] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  async function retry(item: RecoverableIncident) {
    const reason = window.prompt("Why are you releasing this job for one manual retry?", "Channel configuration reviewed by clinic team");
    if (!reason) return;
    setWorking(item.id);
    setNotice("");
    const response = await fetch("/api/operations/retry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, kind: item.kind, reason }),
    });
    const result = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) {
      setNotice(result.error ?? "The automation could not be released.");
      setWorking(null);
      return;
    }
    setNotice("Released for one audited retry. The worker will pick it up automatically.");
    window.setTimeout(() => window.location.reload(), 800);
  }

  return <section className="operations-recovery">
    <header><div><span className="app-eyebrow">RECOVERY CONTROL</span><h3>Dead-letter review</h3></div><span>{incidents.length} recoverable</span></header>
    <p>Only exhausted reminder jobs appear here. Review the channel or template issue first, then release exactly one audited retry.</p>
    {incidents.length ? <div>{incidents.map((item) => <article key={`${item.kind}-${item.id}`}>
      <div><b>{item.title}</b><span>{item.detail}</span><time>{new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(item.at))}</time></div>
      <button type="button" onClick={() => retry(item)} disabled={working === item.id}>{working === item.id ? "Releasing…" : "Review & retry"}</button>
    </article>)}</div> : <div className="operations-recovery-empty"><b>No exhausted jobs awaiting review</b><span>Automatic retries have either completed or remain within their safe retry window.</span></div>}
    {notice && <p className="operations-recovery-notice">{notice}</p>}
    {recoveries.length > 0 && <div className="operations-recovery-history"><b>Recent recovery decisions</b>{recoveries.slice(0, 5).map((item) => <article key={item.id}><div><strong>{item.job_kind === "appointment_reminder" ? "Appointment reminder" : "Care reminder"}</strong><span>{item.reason}</span></div><time>{new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(item.created_at))}</time></article>)}</div>}
  </section>;
}
