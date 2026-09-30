"use client";

import { CircleHelp } from "lucide-react";
import { Conversation, ContactAddress, Contact, Message } from "@/app/app/conversations/types";
import { textFromContent, timeLabel } from "@/app/app/conversations/utils";

interface ConversationListProps {
  mobilePanel: "list" | "thread";
  query: string;
  setQuery: (val: string) => void;
  rows: Conversation[];
  activeId: string | null;
  selectConversation: (id: string) => void;
  contactByAddress: Map<string, { address: ContactAddress; contact: Contact | null }>;
  messagesByConversation: Map<string, Message[]>;
}

export function ConversationList({
  mobilePanel, query, setQuery, rows, activeId, selectConversation, contactByAddress, messagesByConversation
}: ConversationListProps) {
  return (
    <aside className={`${mobilePanel === "thread" ? "hidden" : "flex"} min-h-0 flex-col border-r border-border bg-panel lg:flex`}>
      <div className="border-b border-border p-3">
        <label className="flex items-center gap-2 rounded-xl border border-input bg-background px-3 py-2 text-muted-foreground focus-within:ring-2 focus-within:ring-ring" aria-label="Search conversations">
          <CircleHelp className="h-4 w-4" />
          <input className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search conversations" />
        </label>
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">Frequent contacts</p>
          <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Frequent contacts">
            {rows.slice(0, 5).map((conversation) => {
              const contact = conversation.contact_address ? contactByAddress.get(conversation.contact_address) : null;
              const name = contact?.contact?.name ?? conversation.name ?? "Contact";
              return (
                <button type="button" className={`flex shrink-0 flex-col items-center gap-1 rounded-lg px-1.5 py-1 text-xs text-muted-foreground transition hover:bg-accent hover:text-accent-foreground ${activeId === conversation.id ? "bg-accent text-accent-foreground" : ""}`} key={conversation.id} onClick={() => selectConversation(conversation.id)}>
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-secondary font-bold text-secondary-foreground">{name.slice(0, 1).toUpperCase()}</span>
                  <span className="max-w-14 truncate">{name.split(" ")[0]}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-xs font-semibold">Conversations</span>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">{rows.length}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {rows.length === 0 && <div className="p-5 text-center text-sm text-muted-foreground">Your inbox is ready. New WhatsApp conversations will appear here.</div>}
        {rows.map((conversation) => {
          const last = messagesByConversation.get(conversation.id)?.at(-1);
          const contact = conversation.contact_address ? contactByAddress.get(conversation.contact_address) : null;
          const name = contact?.contact?.name ?? conversation.name ?? conversation.contact_address ?? "Unknown contact";
          return (
            <button className={`mb-1 grid min-h-14 w-full grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-2 rounded-xl px-2 py-2.5 text-left transition ${activeId === conversation.id ? "bg-accent text-accent-foreground" : "hover:bg-muted"}`} onClick={() => selectConversation(conversation.id)} key={conversation.id}>
              <span className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground">{name.slice(0, 1).toUpperCase()}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{name}</span>
                <span className="block truncate text-xs text-muted-foreground">{last ? textFromContent(last.content) : "Conversation started"}</span>
              </span>
              <time className="self-start text-xs text-muted-foreground">{timeLabel(last?.timestamp ?? conversation.updated_at)}</time>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
