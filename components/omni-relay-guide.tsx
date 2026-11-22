"use client";

import { ArrowUpRight, BookOpenCheck, Send, ShieldCheck, Sparkles, X, Loader2, LifeBuoy, CheckCircle2 } from "lucide-react";
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

  // Support Ticket Escalation State
  const [ticketOpen, setTicketOpen] = useState(false);
  const [ticketEmail, setTicketEmail] = useState("");
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketMessage, setTicketMessage] = useState("");
  const [ticketPriority, setTicketPriority] = useState<"normal" | "high" | "urgent">("normal");
  const [ticketBusy, setTicketBusy] = useState(false);
  const [ticketFeedback, setTicketFeedback] = useState<{ success: boolean; message: string; ticketNumber?: string } | null>(null);

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

  async function handleTicketSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ticketMessage.trim() || !ticketEmail.trim()) return;
    setTicketBusy(true);
    setTicketFeedback(null);

    try {
      const res = await fetch("/api/support/ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: ticketEmail,
          subject: ticketSubject.trim() || `Help inquiry regarding ${context.title}`,
          message: ticketMessage.trim(),
          pathname,
          priority: ticketPriority,
          chatHistory: messages,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setTicketFeedback({ success: false, message: data.error || "Failed to submit ticket." });
      } else {
        setTicketFeedback({
          success: true,
          message: data.message,
          ticketNumber: data.ticketNumber,
        });
        setTicketMessage("");
      }
    } catch {
      setTicketFeedback({ success: false, message: "Network error submitting ticket. Please try again." });
    } finally {
      setTicketBusy(false);
    }
  }

  return (
    <>
      <button 
        type="button" 
        className="fixed bottom-6 right-6 z-40 flex items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-white shadow-xl transition-all duration-300 hover:-translate-y-1 hover:bg-slate-800 hover:shadow-2xl cursor-pointer" 
        onClick={() => setOpen(true)} 
        aria-label="Open OmniRelay Guide"
      >
        <div className="grid size-8 place-items-center rounded-xl bg-gradient-to-br from-[#087fb9] to-[#18bfc5] shadow-[0_0_15px_rgba(24,191,197,0.4)]">
          <Sparkles aria-hidden="true" className="size-4 text-white" />
        </div>
        <div className="flex flex-col items-start pr-2">
          <b className="text-sm font-bold leading-none tracking-tight">Guide</b>
          <small className="mt-1 text-[10px] font-medium uppercase tracking-wider text-slate-300">Product help</small>
        </div>
      </button>

      {open && (
        <aside 
          className="fixed bottom-6 right-6 z-50 flex h-[620px] w-[390px] flex-col overflow-hidden rounded-[24px] border border-slate-200/80 bg-white/98 text-slate-900 shadow-2xl backdrop-blur-xl sm:bottom-6 sm:right-6" 
          aria-label="OmniRelay Guide"
        >
          {/* Header */}
          <header className="relative flex shrink-0 flex-col gap-3 border-b border-slate-100 bg-white/60 p-4 backdrop-blur-md">
            <button 
              type="button" 
              className="absolute right-4 top-4 grid size-8 place-items-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 cursor-pointer" 
              onClick={() => { setOpen(false); setTicketOpen(false); }} 
              aria-label="Close OmniRelay Guide"
            >
              <X className="size-5" />
            </button>
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
                <BookOpenCheck aria-hidden="true" className="size-5" />
              </span>
              <div className="pr-8">
                <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-widest text-[#087fb9]">
                  OmniRelay Guide
                </span>
                <h2 className="text-base font-bold leading-tight text-slate-900">Practical help, in context.</h2>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-slate-500">
              Verified product help for <b className="text-slate-700">{context.title}</b>. It never reads workspace or patient data.
            </p>
          </header>

          {/* Ticket Submission Overlay */}
          {ticketOpen ? (
            <div className="flex-1 overflow-y-auto p-4 bg-slate-50/70 space-y-3">
              <div className="flex items-center justify-between border-b pb-2">
                <div className="flex items-center gap-2">
                  <LifeBuoy className="size-4 text-[#087fb9]" />
                  <b className="text-sm text-slate-900">Raise Support Ticket</b>
                </div>
                <button
                  type="button"
                  onClick={() => { setTicketOpen(false); setTicketFeedback(null); }}
                  className="text-xs text-slate-500 hover:text-slate-700 font-semibold"
                >
                  ← Back to chat
                </button>
              </div>

              {ticketFeedback ? (
                <div className={`p-4 rounded-xl border text-xs space-y-2 ${ticketFeedback.success ? "bg-teal-50 border-teal-200 text-teal-900" : "bg-rose-50 border-rose-200 text-rose-900"}`}>
                  <div className="flex items-center gap-2 font-bold">
                    {ticketFeedback.success ? <CheckCircle2 className="size-4 text-teal-600" /> : <X className="size-4 text-rose-600" />}
                    <span>{ticketFeedback.success ? `Ticket #${ticketFeedback.ticketNumber} Raised` : "Submission Failed"}</span>
                  </div>
                  <p className="leading-relaxed">{ticketFeedback.message}</p>
                  {ticketFeedback.success && (
                    <button
                      type="button"
                      onClick={() => { setTicketOpen(false); setTicketFeedback(null); }}
                      className="mt-2 w-full rounded-lg bg-teal-600 py-1.5 font-bold text-white shadow-sm hover:bg-teal-700"
                    >
                      Done
                    </button>
                  )}
                </div>
              ) : (
                <form onSubmit={handleTicketSubmit} className="space-y-3 text-xs">
                  <p className="text-slate-600 leading-relaxed">
                    Need help from our engineering team? Submit your question and we will follow up directly.
                  </p>

                  <label className="block space-y-1">
                    <span className="font-semibold text-slate-700">Your Email Address *</span>
                    <input
                      type="email"
                      required
                      value={ticketEmail}
                      onChange={(e) => setTicketEmail(e.target.value)}
                      placeholder="doctor@clinic.com"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#087fb9]"
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="font-semibold text-slate-700">Subject</span>
                    <input
                      type="text"
                      value={ticketSubject}
                      onChange={(e) => setTicketSubject(e.target.value)}
                      placeholder={`Question regarding ${context.title}`}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#087fb9]"
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="font-semibold text-slate-700">Detailed Question or Issue *</span>
                    <textarea
                      required
                      rows={4}
                      value={ticketMessage}
                      onChange={(e) => setTicketMessage(e.target.value)}
                      placeholder="Explain what you need assistance with..."
                      className="w-full rounded-lg border border-slate-200 p-3 text-xs text-slate-900 focus:outline-none focus:border-[#087fb9]"
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="font-semibold text-slate-700">Priority Level</span>
                    <select
                      value={ticketPriority}
                      onChange={(e) => setTicketPriority(e.target.value as "normal" | "high" | "urgent")}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#087fb9]"
                    >
                      <option value="normal">Normal (General Product Question)</option>
                      <option value="high">High (Feature Configuration)</option>
                      <option value="urgent">Urgent (Live Dispatch / Booking Blocker)</option>
                    </select>
                  </label>

                  <button
                    type="submit"
                    disabled={ticketBusy || !ticketMessage.trim() || !ticketEmail.trim()}
                    className="w-full rounded-xl bg-[#087fb9] py-2.5 font-bold text-white shadow-sm hover:bg-[#066d9c] disabled:opacity-50 cursor-pointer"
                  >
                    {ticketBusy ? "Submitting Ticket…" : "Submit Support Ticket"}
                  </button>
                </form>
              )}
            </div>
          ) : (
            /* Thread (Chat history) */
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50" ref={threadRef} aria-live="polite">
              {messages.length === 0 && (
                <div className="flex items-start gap-3 rounded-2xl bg-indigo-50 p-4 border border-indigo-100/50">
                  <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-indigo-500 text-white shadow-sm shadow-indigo-500/20">
                    <Sparkles className="size-4" />
                  </span>
                  <div>
                    <b className="mb-1 block text-sm font-bold text-indigo-900">Get unstuck quickly</b>
                    <p className="text-xs leading-relaxed text-indigo-700/80">
                      Ask what this page does, why it matters, or how any OmniRelay function works.
                    </p>
                  </div>
                </div>
              )}
              
              {messages.map((message, index) => (
                <article 
                  className={`flex w-full ${message.role === "user" ? "justify-end" : "justify-start"}`} 
                  key={`${message.role}-${index}`}
                >
                  <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-xs leading-relaxed whitespace-pre-wrap ${
                    message.role === "user" 
                      ? "bg-[#087fb9] text-white rounded-br-sm shadow-sm" 
                      : "bg-white text-slate-800 border border-slate-200/90 rounded-bl-sm shadow-sm"
                  }`}>
                    {message.text || (busy ? <span className="flex items-center gap-2 text-slate-400"><Loader2 className="size-3.5 animate-spin" /> Analyzing knowledge base…</span> : "")}
                  </div>
                </article>
              ))}
            </div>
          )}

          {/* Input Area */}
          {!ticketOpen && (
            <div className="shrink-0 border-t border-slate-100 bg-white p-3 space-y-2.5">
              {messages.length === 0 && (
                <div className="space-y-1.5" aria-label="Suggested questions">
                  {context.suggestions.map((suggestion) => (
                    <button 
                      type="button" 
                      key={suggestion} 
                      disabled={busy} 
                      onClick={() => void ask(suggestion)}
                      className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200/90 bg-white px-3 py-1.5 text-left text-xs font-medium text-slate-700 transition-colors hover:border-[#087fb9] hover:text-[#087fb9] disabled:opacity-50 cursor-pointer"
                    >
                      <span className="truncate">{suggestion}</span>
                      <ArrowUpRight className="size-3 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
              
              <form 
                className="relative flex items-center rounded-xl border border-slate-200 bg-slate-50 focus-within:border-[#087fb9] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#087fb9]/20 transition-all" 
                onSubmit={(event) => { event.preventDefault(); void ask(); }}
              >
                <textarea 
                  value={question} 
                  onChange={(event) => setQuestion(event.target.value)} 
                  placeholder={`Ask anything about ${context.title}…`} 
                  maxLength={800} 
                  rows={1}
                  className="w-full resize-none bg-transparent py-2.5 pl-3 pr-10 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void ask();
                    }
                  }}
                />
                <button 
                  type="submit" 
                  disabled={busy || question.trim().length < 2} 
                  aria-label="Ask OmniRelay Guide"
                  className="absolute right-1.5 grid size-7 place-items-center rounded-lg bg-[#087fb9] text-white transition-colors hover:bg-[#066d9c] disabled:bg-slate-200 disabled:text-slate-400 cursor-pointer"
                >
                  <Send className="size-3.5 ml-0.5" />
                </button>
              </form>
              
              {error && <p className="text-[11px] font-medium text-rose-500" role="status">{error}</p>}
              
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setTicketSubject(question.trim() || `Inquiry regarding ${context.title}`);
                    setTicketOpen(true);
                  }}
                  className="flex items-center gap-1.5 text-xs font-semibold text-[#087fb9] hover:underline cursor-pointer"
                >
                  <LifeBuoy className="size-3.5" />
                  <span>Raise Support Ticket</span>
                </button>

                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <ShieldCheck className="size-3.5 text-slate-400" />
                  <a href={supportHref} className="font-semibold text-slate-600 hover:text-[#087fb9] hover:underline">
                    Email support
                  </a>
                </div>
              </div>
            </div>
          )}
          
          <footer className="shrink-0 bg-slate-50 py-2 text-center text-[9px] font-medium uppercase tracking-wider text-slate-400 border-t border-slate-100">
            Informational only · Do not enter patient, customer, payment or secret data.
          </footer>
        </aside>
      )}
    </>
  );
}

