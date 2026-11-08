"use client";

import { Search } from "lucide-react";
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
      <div className="border-b border-border p-2.5">
        <label className="flex items-center gap-2 rounded-lg border border-input bg-background px-2.5 py-1.5 text-muted-foreground focus-within:ring-1 focus-within:ring-ring" aria-label="Search conversations">
          <Search className="h-3.5 w-3.5 shrink-0" />
          <input className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search chats…" />
        </label>
        {rows.length > 1 && (
          <div className="mt-2.5">
            <p className="mb-1 text-[11px] font-semibold text-muted-foreground">Recent</p>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5" aria-label="Recent contacts">
              {rows.slice(0, 5).map((conversation) => {
                const contact = conversation.contact_address ? contactByAddress.get(conversation.contact_address) : null;
                const name = contact?.contact?.name ?? conversation.name ?? "Contact";
                return (
                  <button type="button" className={`flex shrink-0 flex-col items-center gap-0.5 rounded-md px-1.5 py-1 text-[10px] text-muted-foreground transition hover:bg-accent hover:text-accent-foreground ${activeId === conversation.id ? "bg-accent text-accent-foreground" : ""}`} key={conversation.id} onClick={() => selectConversation(conversation.id)}>
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-secondary text-[11px] font-bold text-secondary-foreground">{name.slice(0, 1).toUpperCase()}</span>
                    <span className="max-w-12 truncate">{name.split(" ")[0]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs">
        <span className="font-semibold text-muted-foreground">Chats</span>
        <span className="rounded-full bg-secondary px-1.5 py-0.2 text-[10px] font-bold text-secondary-foreground">{rows.length}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {rows.length === 0 && <div className="p-4 text-center text-xs text-muted-foreground">Your inbox is ready. New WhatsApp conversations will appear here.</div>}
        {rows.map((conversation) => {
          const last = messagesByConversation.get(conversation.id)?.at(-1);
          const contact = conversation.contact_address ? contactByAddress.get(conversation.contact_address) : null;
          const name = contact?.contact?.name ?? conversation.name ?? conversation.contact_address ?? "Unknown contact";
          return (
            <button className={`mb-1 grid min-h-11 w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-2 py-1.5 text-left transition ${activeId === conversation.id ? "bg-accent text-accent-foreground" : "hover:bg-muted"}`} onClick={() => selectConversation(conversation.id)} key={conversation.id}>
              <span className="grid h-7 w-7 place-items-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground">{name.slice(0, 1).toUpperCase()}</span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold">{name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{last ? textFromContent(last.content) : "Conversation started"}</span>
              </span>
              <time className="self-start text-[10px] text-muted-foreground">{timeLabel(last?.timestamp ?? conversation.updated_at)}</time>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
