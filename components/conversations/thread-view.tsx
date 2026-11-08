"use client";

import { FormEvent, RefObject } from "react";
import { Info, Paperclip, Phone, SendHorizontal, Smile, Video } from "lucide-react";
import { Agent, AiSuggestion, Conversation, Message } from "@/app/app/conversations/types";
import { deliveryPresentation, messageOrigin, textFromContent, timeLabel } from "@/app/app/conversations/utils";
import { whatsappFailure } from "@/lib/whatsapp-delivery";

interface ThreadViewProps {
  mobilePanel: "list" | "thread";
  setMobilePanel: (val: "list" | "thread") => void;
  active: Conversation | null;
  activeName: string;
  agents: Agent[];
  updateConversation: (update: { assignedAgentId?: string | null; aiPaused?: boolean }) => void;
  thread: Message[];
  endRef: RefObject<HTMLDivElement | null>;
  send: (e: FormEvent) => void;
  error: string;
  suggesting: boolean;
  suggestReply: () => void;
  serviceWindowOpen: boolean;
  aiSuggestion: AiSuggestion | null;
  setAiSuggestion: (val: AiSuggestion | null) => void;
  draft: string;
  setDraft: (val: string) => void;
  sending: boolean;
  serviceWindowEndsAt: number;
  openTemplateComposer: (useActiveContact: boolean) => void;
}

export function ThreadView({
  mobilePanel, setMobilePanel, active, activeName, agents, updateConversation,
  thread, endRef, send, error, suggesting, suggestReply, serviceWindowOpen,
  aiSuggestion, setAiSuggestion, draft, setDraft, sending, serviceWindowEndsAt, openTemplateComposer
}: ThreadViewProps) {
  if (!active) {
    return (
      <section className={`${mobilePanel === "list" ? "hidden" : "flex"} min-h-0 flex-col bg-background lg:flex`}>
        <div className="grid flex-1 place-items-center p-6 text-center">
          <div>
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-secondary text-secondary-foreground">
              <SendHorizontal className="h-5 w-5" />
            </span>
            <h2 className="mt-4 text-lg font-semibold">Select a conversation</h2>
            <p className="mt-1 text-sm text-muted-foreground">Customer messages and booking context will appear here.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={`${mobilePanel === "list" ? "hidden" : "flex"} min-h-0 flex-col bg-background lg:flex`}>
      <header className="flex shrink-0 items-center justify-between gap-2.5 border-b border-border bg-panel px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <button className="rounded-md p-1 text-muted-foreground hover:bg-muted lg:hidden" type="button" onClick={() => setMobilePanel("list")} aria-label="Back to conversations">←</button>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground">{activeName.slice(0, 1).toUpperCase()}</span>
          <span className="min-w-0">
            <b className="block truncate text-xs sm:text-sm font-semibold">{activeName}</b>
            <small className="block truncate text-[11px] text-muted-foreground">{active.ai_paused ? "Human takeover active" : "AI assist ready"} · WhatsApp</small>
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" aria-label="Call patient" title="Calling is not enabled"><Phone className="h-3.5 w-3.5" /></button>
          <button type="button" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" aria-label="Video call" title="Video calling is not enabled"><Video className="h-3.5 w-3.5" /></button>
          <button type="button" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" aria-label="Patient information"><Info className="h-3.5 w-3.5" /></button>
          <select className="hidden rounded-md border border-input bg-panel px-2 py-1 text-xs outline-none sm:block" aria-label="Assign conversation" value={active.assigned_agent_id ?? ""} onChange={(event) => void updateConversation({ assignedAgentId: event.target.value || null })}>
            <option value="">Unassigned</option>
            {agents.filter((agent) => !agent.ai).map((agent) => <option value={agent.id} key={agent.id}>{agent.name}</option>)}
          </select>
          <button type="button" className={`hidden rounded-md px-2 py-1 text-xs font-semibold sm:block ${active.ai_paused ? "bg-accent text-accent-foreground" : "bg-secondary text-secondary-foreground"}`} onClick={() => void updateConversation({ aiPaused: !active.ai_paused })}>{active.ai_paused ? "Takeover" : "AI assist"}</button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        <div className="mx-auto max-w-2xl">
          <p className="mb-3 text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Conversation history</p>
          {thread.map((message) => {
            const delivery = deliveryPresentation(message.status);
            const failure = whatsappFailure(message.status);
            const outgoing = message.direction === "outgoing";
            const origin = messageOrigin(message);
            const showOriginTag = origin !== "Staff reply" && origin !== "Patient reply";
            return (
              <article className={`mb-2 flex ${outgoing ? "justify-end" : "justify-start"}`} key={message.id}>
                <div className={`max-w-[78%] rounded-xl px-3 py-2 text-xs sm:text-[13px] shadow-xs ${outgoing ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm border border-border bg-panel text-foreground"}`}>
                  {showOriginTag && <span className={`mb-1 block text-[10px] font-bold ${outgoing ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{origin}</span>}
                  <p className="whitespace-pre-wrap leading-relaxed">{textFromContent(message.content)}</p>
                  <footer className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${outgoing ? "text-primary-foreground/75" : "text-muted-foreground"}`}>
                    <time>{timeLabel(message.timestamp)}</time>
                    {outgoing && <span title={delivery.label} aria-label={`Message ${delivery.label.toLowerCase()}`}>{delivery.icon} {delivery.label}</span>}
                  </footer>
                  {failure && (
                    <aside className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-foreground">
                      <b>{failure.title}</b>
                      <p className="mt-0.5 text-[11px]">{failure.action}</p>
                      <a className="mt-1 inline-block text-[11px] font-semibold text-primary" href="/app/operations">Review operations →</a>
                    </aside>
                  )}
                </div>
              </article>
            );
          })}
          <div ref={endRef} />
        </div>
      </div>
      <form className="shrink-0 border-t border-border bg-panel p-2.5 sm:p-3" onSubmit={send}>
        {active.ai_paused && <p className="mb-1.5 text-[11px] font-medium text-accent-foreground">AI is paused while your team handles this conversation.</p>}
        {error && <p className="mb-1.5 rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">{error}</p>}
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <button type="button" className="text-xs font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-50" disabled={suggesting || !serviceWindowOpen} onClick={() => void suggestReply()}>{suggesting ? "Checking approved knowledge…" : "Suggest reply"}</button>
          <span className="text-[10px] text-muted-foreground">Nothing sent automatically</span>
        </div>
        {aiSuggestion && (
          <aside className="mb-2 rounded-lg border border-border bg-muted p-2.5 text-xs">
            <div className="flex items-start justify-between gap-2">
              <div>
                <b>{aiSuggestion.classification === "business_answer" ? "Grounded draft" : aiSuggestion.classification === "urgent" ? "Urgent escalation" : aiSuggestion.classification === "clinical_handoff" ? "Clinical handoff" : "Human handoff"}</b>
                <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{aiSuggestion.answer}</p>
              </div>
              <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setAiSuggestion(null)} aria-label="Dismiss AI suggestion">×</button>
            </div>
            <button type="button" className="mt-1.5 text-xs font-semibold text-primary" onClick={() => { setDraft(aiSuggestion.answer); setAiSuggestion(null); }}>Use draft</button>
          </aside>
        )}
        {serviceWindowOpen ? (
          <>
            <div className="flex items-center gap-1.5 rounded-xl border border-input bg-background p-1 pl-2.5 shadow-2xs focus-within:ring-1 focus-within:ring-ring">
              <button type="button" disabled className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground disabled:cursor-not-allowed opacity-50" title="Attachments are not enabled" aria-label="Attachments are not enabled"><Paperclip className="h-3.5 w-3.5" /></button>
              <textarea className="max-h-24 min-h-6 flex-1 resize-none bg-transparent py-1 text-xs sm:text-[13px] leading-5 outline-none placeholder:text-muted-foreground" aria-label="Reply message" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a WhatsApp reply…" rows={1} />
              <button type="button" disabled className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground disabled:cursor-not-allowed opacity-50" title="Emoji reactions are not enabled" aria-label="Emoji reactions are not enabled"><Smile className="h-3.5 w-3.5" /></button>
              <button className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Send message" disabled={!draft.trim() || sending}>{sending ? "…" : <SendHorizontal className="h-3.5 w-3.5" />}</button>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">24h reply window active until {new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(serviceWindowEndsAt))}.</p>
          </>
        ) : (
          <div className="flex items-center justify-between gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs">
            <span><b className="block">24-hour reply window closed</b><small className="text-muted-foreground">Use an approved template to contact this patient again.</small></span>
            <button type="button" className="shrink-0 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground" onClick={() => openTemplateComposer(true)}>Send template</button>
          </div>
        )}
      </form>
    </section>
  );
}
