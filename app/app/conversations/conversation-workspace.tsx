"use client";

import { useRef } from "react";
import { Conversation, Message, ContactAddress, Contact, Agent, Connection, Template } from "./types";
import { useConversationWorkspace } from "./use-conversation-workspace";
import { ConversationList } from "@/components/conversations/conversation-list";
import { ThreadView } from "@/components/conversations/thread-view";
import { ContactSidebar } from "@/components/conversations/contact-sidebar";
import { ContactEditorModal } from "@/components/conversations/contact-editor-modal";
import { NewConversationModal } from "@/components/conversations/new-conversation-modal";

export function ConversationWorkspace({
  organizationId,
  initialConversations,
  initialMessages,
  contactAddresses,
  contacts,
  agents,
  connection,
  templates,
  organizationName,
}: {
  organizationId: string;
  initialConversations: Conversation[];
  initialMessages: Message[];
  contactAddresses: ContactAddress[];
  contacts: Contact[];
  agents: Agent[];
  connection: Connection;
  templates: Template[];
  organizationName: string;
}) {
  const state = useConversationWorkspace(organizationId, initialConversations, initialMessages, contactAddresses, contacts);
  const endRef = useRef<HTMLDivElement>(null);

  const assigned = agents.find((agent) => agent.id === state.active?.assigned_agent_id) ?? null;
  const latestIncoming = [...state.thread].reverse().find((message) => message.direction === "incoming");
  const serviceWindowEndsAt = latestIncoming ? new Date(latestIncoming.timestamp).getTime() + 24 * 60 * 60 * 1000 : 0;
  const serviceWindowOpen = serviceWindowEndsAt > state.clock;

  if (!connection || !["test", "live"].includes(connection.status)) {
    return (
      <main className="inbox-connect-state">
        <span className="app-eyebrow">SHARED INBOX</span>
        <h2>Connect WhatsApp to open your inbox.</h2>
        <p>Incoming customer messages, booking context and human handoffs will appear here after the channel is live.</p>
        <a href="/app/integrations">Connect WhatsApp →</a>
      </main>
    );
  }

  return (
    <main className="flex h-[calc(100vh-5.5rem)] min-h-[42rem] flex-col overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-marble">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border bg-panel px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <span className={`h-2 w-2 shrink-0 rounded-full ${state.realtimeStatus === "live" ? "bg-teal" : "bg-amber-500"}`} />
          <span className="truncate font-semibold">{connection.display_name ?? "WhatsApp Business"}</span>
          <span className="hidden text-muted-foreground sm:inline">· {connection.display_address ?? "Connected"}</span>
          {state.realtimeStatus !== "live" && <span className="hidden text-xs text-muted-foreground md:inline">· Live updates reconnecting</span>}
        </div>
        <button type="button" className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition hover:opacity-90" onClick={() => state.openTemplateComposer(false)}>New conversation</button>
      </header>
      <section className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[19rem_minmax(0,1fr)_20rem]">
        <ConversationList
          mobilePanel={state.mobilePanel} query={state.query} setQuery={state.setQuery}
          rows={state.rows} activeId={state.activeId} selectConversation={state.selectConversation}
          contactByAddress={state.contactByAddress} messagesByConversation={state.messagesByConversation}
        />
        <ThreadView
          mobilePanel={state.mobilePanel} setMobilePanel={state.setMobilePanel}
          active={state.active} activeName={state.activeName} agents={agents}
          updateConversation={state.updateConversation} thread={state.thread}
          endRef={endRef} send={state.send} error={state.error}
          suggesting={state.suggesting} suggestReply={state.suggestReply}
          serviceWindowOpen={serviceWindowOpen} aiSuggestion={state.aiSuggestion}
          setAiSuggestion={state.setAiSuggestion} draft={state.draft}
          setDraft={state.setDraft} sending={state.sending}
          serviceWindowEndsAt={serviceWindowEndsAt} openTemplateComposer={state.openTemplateComposer}
        />
        <ContactSidebar
          active={state.active} activeName={state.activeName} linked={state.linked}
          assigned={assigned} setError={state.setError} setContactEditorOpen={state.setContactEditorOpen}
        />
      </section>
      
      {state.contactEditorOpen && (
        <ContactEditorModal
          active={state.active} linked={state.linked}
          setContactEditorOpen={state.setContactEditorOpen} saveContact={state.saveContact}
          savingContact={state.savingContact} error={state.error}
        />
      )}
      
      {state.newConversationOpen && (
        <NewConversationModal
          templateTarget={state.templateTarget} activeId={state.activeId}
          setNewConversationOpen={state.setNewConversationOpen} startConversation={state.startConversation}
          connection={connection} templates={templates}
          selectedTemplateId={state.selectedTemplateId} setSelectedTemplateId={state.setSelectedTemplateId}
          organizationName={organizationName} startingConversation={state.startingConversation} error={state.error}
        />
      )}
    </main>
  );
}
