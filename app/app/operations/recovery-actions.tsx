"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

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
  const router = useRouter();
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
    setTimeout(() => {
      setWorking(null);
      setNotice("");
      router.refresh();
    }, 1500);
  }

  return <section className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm">
    <header className="flex flex-col md:flex-row md:items-center justify-between mb-4 border-b border-slate-100 pb-4"><div><span className="or-type-label text-[#1688d5] block mb-2">RECOVERY CONTROL</span><h3 className="or-type-section text-slate-900">Dead-letter review</h3></div><span className="text-[13px] font-bold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full">{incidents.length} recoverable</span></header>
    <p className="text-[14px] text-slate-500 mb-6">Only exhausted reminder jobs appear here. Review the channel or template issue first, then release exactly one audited retry.</p>
    {incidents.length ? <div className="flex flex-col gap-3">{incidents.map((item) => <article key={`${item.kind}-${item.id}`} className="flex flex-col sm:flex-row sm:items-center justify-between p-5 rounded-xl border border-slate-100 bg-slate-50 gap-4">
      <div className="flex flex-col"><b className="text-[15px] text-slate-900 mb-1">{item.title}</b><span className="text-[13px] text-slate-500 mb-2">{item.detail}</span><time className="text-[12px] font-medium text-slate-400">{new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(item.at))}</time></div>
      <button type="button" onClick={() => retry(item)} disabled={working === item.id} className="self-start sm:self-auto px-4 py-2 bg-white border border-slate-200 text-slate-700 text-[13px] font-bold rounded-lg shadow-sm hover:bg-slate-50 disabled:opacity-50 transition-colors">{working === item.id ? "Releasing…" : "Review & retry"}</button>
    </article>)}</div> : <div className="flex flex-col items-center justify-center py-6 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200"><b className="text-[15px] text-slate-800">No exhausted jobs awaiting review</b><span className="text-[13px] text-slate-500 mt-1">Automatic retries have either completed or remain within their safe retry window.</span></div>}
    {notice && <p className="mt-4 p-3 bg-blue-50 text-blue-700 text-[13px] font-medium rounded-lg">{notice}</p>}
    {recoveries.length > 0 && <div className="mt-8 pt-6 border-t border-slate-100"><b className="block text-[14px] text-slate-800 mb-4">Recent recovery decisions</b><div className="flex flex-col gap-2">{recoveries.slice(0, 5).map((item) => <article key={item.id} className="flex justify-between items-start p-3 bg-slate-50 rounded-lg"><div className="flex flex-col"><strong className="text-[13px] text-slate-700 font-bold">{item.job_kind === "appointment_reminder" ? "Appointment reminder" : "Care reminder"}</strong><span className="text-[13px] text-slate-500">{item.reason}</span></div><time className="text-[12px] text-slate-400 whitespace-nowrap">{new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(item.created_at))}</time></article>)}</div></div>}
  </section>;
}
