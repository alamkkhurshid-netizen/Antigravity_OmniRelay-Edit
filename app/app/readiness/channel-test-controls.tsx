"use client";
import { useState } from "react";

type Scenario = "commands_handoff" | "abandoned_recovery";
type Control = { scenario: Scenario; title: string; detail: string; status: string };

export function ChannelTestControls({ controls }: { controls: Control[] }) {
  const [busy, setBusy] = useState<Scenario | null>(null);
  const [notice, setNotice] = useState("");

  async function prepare(scenario: Scenario) {
    setBusy(scenario); setNotice("");
    const response = await fetch("/api/readiness/channel-test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scenario }) });
    const result = await response.json().catch(() => ({})) as { run?: { recipient_last4: string; max_messages: number }; error?: string };
    if (!response.ok || !result.run) setNotice(result.error ?? "The controlled test could not be prepared.");
    else { setNotice(`Prepared for delivery-verified ••••${result.run.recipient_last4} with a ${result.run.max_messages}-message ceiling. No message has been sent yet.`); setTimeout(() => location.reload(), 900); }
    setBusy(null);
  }

  return <section className="readiness-test-control"><div><span className="app-eyebrow">FINAL CHANNEL ACCEPTANCE</span><h3>Commands and recovery tests</h3><p>Preparation is administrator-only and does not send a message. Service-controlled dispatch must claim the bounded 30-minute test lease.</p>{controls.map(control => { const locked = ["armed", "running", "passed"].includes(control.status); return <article key={control.scenario}><div><b>{control.title}</b><small>{control.detail}</small></div><button type="button" disabled={busy !== null || locked} onClick={() => void prepare(control.scenario)}>{busy === control.scenario ? "Preparing…" : locked ? `Status: ${control.status}` : "Prepare test"}</button></article>; })}{notice && <small role="status">{notice}</small>}</div></section>;
}
