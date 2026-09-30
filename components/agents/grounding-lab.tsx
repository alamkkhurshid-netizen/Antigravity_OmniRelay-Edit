"use client";

import { FormEvent } from "react";
import { Preview } from "@/app/app/agents/types";

interface GroundingLabProps {
  testQuestion: string;
  setTestQuestion: (val: string) => void;
  testing: boolean;
  preview: Preview | null;
  testAgent: (event: FormEvent<HTMLFormElement>) => void;
}

export function GroundingLab({
  testQuestion, setTestQuestion, testing, preview, testAgent
}: GroundingLabProps) {
  return (
    <section className="agent-lab">
      <div className="agent-lab-copy">
        <span className="app-eyebrow">GROUNDING LAB</span>
        <h3>Test before the agent talks to a patient.</h3>
        <p>Ask a real patient question. OmniRelay shows the exact approved sources and live clinic facts it can use—or hands the question to staff when evidence is missing.</p>
        <div className="agent-example-questions">
          {["What is the consultation fee?", "Where is the chamber?", "How should I prepare for my appointment?"].map((question)=><button type="button" key={question} onClick={()=>setTestQuestion(question)}>{question}</button>)}
        </div>
      </div>
      <form className="agent-test-console" onSubmit={testAgent}>
        <label>
          Patient question
          <textarea value={testQuestion} onChange={(event)=>setTestQuestion(event.target.value)} minLength={3} maxLength={500} required placeholder="Ask the concierge a question…"/>
        </label>
        <button className="primary-button" disabled={testing}>{testing?"Checking approved sources…":"Run grounded preview"}</button>
        {preview && (
          <div className={`agent-preview agent-preview-${preview.confidence}`}>
            <header>
              <b>{preview.confidence==="grounded"?"Grounded answer":preview.confidence==="limited"?"Limited evidence":"Human handoff"}</b>
              <span>{preview.confidence}</span>
            </header>
            <p>{preview.answer}</p>
            {preview.sources.length>0 && (
              <div>
                <small>Sources used</small>
                {preview.sources.map((source)=><i key={source.id}>{source.title}</i>)}
              </div>
            )}
            <footer>{preview.safety}</footer>
          </div>
        )}
      </form>
    </section>
  );
}
