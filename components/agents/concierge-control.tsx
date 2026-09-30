"use client";

import { Agent } from "@/app/app/agents/types";

interface ConciergeControlProps {
  activeAgent?: Agent;
  readinessChecks: Array<{label: string; detail: string; ready: boolean}>;
  agentReady: boolean;
  setShowAgentSettings: (val: boolean) => void;
}

export function ConciergeControl({
  activeAgent, readinessChecks, agentReady, setShowAgentSettings
}: ConciergeControlProps) {
  return (
    <section className="concierge-control">
      <div className="concierge-control-main">
        <span className="app-eyebrow">CLINIC AI CONCIERGE</span>
        <div className="concierge-title">
          <div>
            <h3>{activeAgent?.name??"Appointment Concierge"}</h3>
            <p>Supervised answers from approved clinic knowledge, with automatic handoff for medical advice and urgent language.</p>
          </div>
          <i className={`agent-state agent-state-${activeAgent?.status??"training"}`}>
            {activeAgent?.status??"training"}
          </i>
        </div>
        <div className="readiness-checks">
          {readinessChecks.map((check)=><article className={check.ready?"ready":""} key={check.label}><span>{check.ready?"✓":"○"}</span><div><b>{check.label}</b><small>{check.detail}</small></div></article>)}
        </div>
      </div>
      <div className="concierge-control-action">
        <b>{agentReady?"Core safeguards ready":"Training requirements incomplete"}</b>
        <p>{agentReady?"Configure channels and run the safety test before a supervised WhatsApp pilot.":"Approve at least five clinic FAQs and keep a clear human handoff response."}</p>
        <button className="primary-button" type="button" onClick={()=>setShowAgentSettings(true)}>Configure concierge</button>
      </div>
    </section>
  );
}
