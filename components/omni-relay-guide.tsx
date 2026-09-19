"use client";

import { ArrowUpRight, BookOpenCheck, Send, ShieldCheck, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { guideContextForPath, guideSupport } from "@/lib/omni-relay-guide";

type Message = { role: "user" | "model"; text: string };

export function OmniRelayGuide() {
  const pathname = usePathname();
  const context = guideContextForPath(pathname);
  const supportHref = `mailto:${guideSupport.email}?subject=${encodeURIComponent(`OmniRelay Guide support — ${context.title}`)}`;
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reset = window.setTimeout(() => {
      setMessages([]);
      setQuestion("");
      setError("");
    }, 0);
    return () => window.clearTimeout(reset);
  }, [pathname]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function ask(value = question) {
    const prompt = value.trim();
    if (prompt.length < 2 || busy) return;
    const previous = messages.slice(-6);
    setQuestion("");
    setError("");
    setBusy(true);
    setMessages((current) => [...current, { role: "user", text: prompt }, { role: "model", text: "" }]);

    try {
      const response = await fetch("/api/omni-relay-guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: prompt, pathname, history: previous }),
      });
      if (!response.ok || !response.body) {
        const result = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(result.error ?? "OmniRelay Guide could not answer right now.");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((current) => current.map((item, index) => index === current.length - 1 ? { ...item, text: item.text + chunk } : item));
      }
    } catch (caught) {
      setMessages((current) => current.slice(0, -1));
      setError(caught instanceof Error ? caught.message : "OmniRelay Guide could not answer right now.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <button type="button" className="or-guide-launcher" onClick={() => setOpen(true)} aria-label="Open OmniRelay Guide">
      <Sparkles aria-hidden="true" size={17} />
      <span><b>Guide</b><small>Product help</small></span>
    </button>
    {open && <aside className="or-guide-panel" aria-label="OmniRelay Guide">
      <header className="or-guide-header">
        <div className="or-guide-heading">
          <span className="or-guide-icon"><BookOpenCheck aria-hidden="true" size={20} /></span>
          <div><span className="app-eyebrow">OMNIRELAY GUIDE</span><h2>Practical help, in context.</h2></div>
        </div>
        <button type="button" className="or-guide-close" onClick={() => setOpen(false)} aria-label="Close OmniRelay Guide"><X size={19} /></button>
        <p>Verified product help for <b>{context.title}</b>. It never reads workspace or patient data.</p>
      </header>
      <div className="or-guide-thread" ref={threadRef} aria-live="polite">
        {messages.length === 0 && <div className="or-guide-welcome">
          <span className="or-guide-welcome-icon"><Sparkles size={18} /></span>
          <div><b>Get unstuck quickly</b><p>Ask what this page does, why it matters, or the safest next step.</p></div>
        </div>}
        {messages.map((message, index) => <article className={`or-guide-message ${message.role}`} key={`${message.role}-${index}`}><span>{message.text || (busy ? "Thinking…" : "")}</span></article>)}
      </div>
      {messages.length === 0 && <div className="or-guide-suggestions" aria-label="Suggested questions">
        {context.suggestions.map((suggestion) => <button type="button" key={suggestion} disabled={busy} onClick={() => void ask(suggestion)}><span>{suggestion}</span><ArrowUpRight size={15} /></button>)}
      </div>}
      <form className="or-guide-composer" onSubmit={(event) => { event.preventDefault(); void ask(); }}>
        <textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={`Ask about ${context.title}…`} maxLength={800} rows={2} />
        <button type="submit" disabled={busy || question.trim().length < 2} aria-label="Ask OmniRelay Guide"><Send size={17} /></button>
      </form>
      {error && <p className="or-guide-error" role="status">{error}</p>}
      <div className="or-guide-support"><ShieldCheck size={16} /><span>Need a person?</span><a href={supportHref}>Email support <ArrowUpRight size={14} /></a></div>
      <footer>Informational only · Do not enter patient, customer, payment or secret data.</footer>
    </aside>}
  </>;
}
