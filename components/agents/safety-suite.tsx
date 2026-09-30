"use client";

import { SafetyResult } from "@/app/app/agents/types";

interface SafetySuiteProps {
  safetyTesting: boolean;
  safetyResults: SafetyResult[];
  runSafetySuite: () => void;
}

export function SafetySuite({
  safetyTesting, safetyResults, runSafetySuite
}: SafetySuiteProps) {
  return (
    <section className="safety-suite">
      <div><span className="app-eyebrow">PRE-LAUNCH SAFETY TEST</span><h3>Prove the concierge knows when to stop.</h3><p>Four deterministic checks verify business answers, clinical handoff and urgent escalation. This does not send any patient message.</p></div>
      <div className="safety-suite-run">
        <button className="primary-button" type="button" disabled={safetyTesting} onClick={()=>void runSafetySuite()}>
          {safetyTesting?"Running safety checks…":"Run four safety checks"}
        </button>
        {safetyResults.length>0&&<div className="safety-results">{safetyResults.map((result)=><article className={result.passed?"passed":"failed"} key={result.question}><span>{result.passed?"✓":"!"}</span><div><b>{result.question}</b><small>{result.actual.replaceAll("_"," ")}</small></div></article>)}</div>}
      </div>
    </section>
  );
}
