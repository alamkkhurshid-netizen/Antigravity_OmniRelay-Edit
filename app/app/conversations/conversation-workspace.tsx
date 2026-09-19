"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ChevronDown, CircleHelp, FileText, Info, MapPin, Paperclip, Phone, SendHorizontal, Smile, Video } from "lucide-react";
import { Accordion, Tabs } from "radix-ui";
import { whatsappFailure } from "@/lib/whatsapp-delivery";

type Json = Record<string, unknown> | null;
type Conversation = {
  id: string;
  service: string;
  organization_address: string;
  contact_address: string | null;
  name: string | null;
  status: string;
  ai_paused: boolean;
  paused_at: string | null;
  assigned_agent_id: string | null;
  extra: Json;
  created_at: string;
  updated_at: string;
};
type Message = {
  id: string;
  conversation_id: string;
  external_id: string | null;
  direction: "incoming" | "outgoing" | "internal";
  content: Json;
  status: Json;
  timestamp: string;
  agent_id: string | null;
};
type ContactAddress = { address: string; contact_id: string | null; extra: Json; status: string };
type Contact = { id: string; name: string | null; status: string; extra: Json };
type Agent = { id: string; name: string; picture: string | null; ai: boolean; user_id: string | null };
type Connection = { status: string; display_name: string | null; display_address: string | null } | null;
type Template = { id: string; event_type: string; provider_template_name: string; language_code: string; status: string; variable_map: Record<string, string> | null };
type AiSuggestion = {
  answer: string;
  confidence: "grounded" | "limited" | "handoff";
  classification: "business_answer" | "clinical_handoff" | "urgent" | "no_source";
  sources: { id: string; title: string; sourceType: string; updatedAt: string }[];
  safety: string;
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function textFromContent(content: Json) {
  const value = object(content);
  if (typeof value.text === "string") return value.text;
  const file = object(value.file);
  if (typeof file.name === "string") return `Attachment · ${file.name}`;
  if (typeof value.kind === "string") return value.kind.replaceAll("_", " ");
  return "Message";
}
function timeLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return new Intl.DateTimeFormat("en-IN", sameDay
    ? { hour: "numeric", minute: "2-digit" }
    : { day: "numeric", month: "short" }).format(date);
}
function deliveryLabel(status: Json) {
  const value = object(status);
  if (value.failed) return "Failed";
  if (value.read) return "Read";
  if (value.delivered) return "Delivered";
  if (value.sent || value.accepted) return "Sent";
  return "Sending";
}
function deliveryPresentation(status: Json) {
  const label = deliveryLabel(status);
  if (label === "Read") return { label, icon: "✓✓", className: "read" };
  if (label === "Delivered") return { label, icon: "✓✓", className: "delivered" };
  if (label === "Sent") return { label, icon: "✓", className: "sent" };
  if (label === "Failed") return { label, icon: "!", className: "failed" };
  return { label, icon: "◷", className: "sending" };
}
function messageOrigin(message: Message) {
  if (message.direction === "incoming") return "Patient reply";
  if (message.direction === "internal") return "Internal note";
  const source = String(object(message.status).source ?? "");
  if (source === "booking_concierge") return "Booking concierge";
  if (source === "whatsapp_booking_handoff") return "Booking confirmation";
  return "Staff reply";
}

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
  const [conversations, setConversations] = useState(initialConversations);
  const [messages, setMessages] = useState(initialMessages);
  const [contactRows, setContactRows] = useState(contacts);
  const [addressRows, setAddressRows] = useState(contactAddresses);
  const [activeId, setActiveId] = useState(initialConversations[0]?.id ?? null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [contactEditorOpen, setContactEditorOpen] = useState(false);
  const [newConversationOpen, setNewConversationOpen] = useState(false);
  const [startingConversation, setStartingConversation] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<AiSuggestion | null>(null);
  const [error, setError] = useState("");
  const [mobilePanel, setMobilePanel] = useState<"list" | "thread">("list");
  const [clock, setClock] = useState(() => Date.now());
  const [templateTarget, setTemplateTarget] = useState<{ phone: string; name: string } | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [realtimeStatus, setRealtimeStatus] = useState<"connecting" | "live" | "reconnecting">("connecting");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`inbox:${organizationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `organization_id=eq.${organizationId}` }, (event) => {
        const next = event.new as Message;
        if (!next?.id) return;
        setMessages((current) => [...current.filter((item) => item.id !== next.id), next]
          .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: `organization_id=eq.${organizationId}` }, (event) => {
        const next = event.new as Conversation;
        if (!next?.id) return;
        setConversations((current) => [next, ...current.filter((item) => item.id !== next.id)]);
        setActiveId((current) => current ?? next.id);
      })
      .subscribe((status) => {
        const live = status === "SUBSCRIBED";
        setRealtimeStatus(live ? "live" : status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT" ? "reconnecting" : "connecting");
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [organizationId]);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function recoverLiveUpdates() {
      const [messagesResult, conversationsResult] = await Promise.all([
        supabase
          .from("messages")
          .select("id,conversation_id,external_id,direction,content,status,timestamp,agent_id")
          .eq("organization_id", organizationId)
          .order("timestamp", { ascending: true })
          .limit(1000),
        supabase
          .from("conversations")
          .select("id,service,organization_address,contact_address,name,status,ai_paused,paused_at,assigned_agent_id,extra,created_at,updated_at")
          .eq("organization_id", organizationId)
          .order("updated_at", { ascending: false })
          .limit(100),
      ]);
      if (cancelled) return;
      if (messagesResult.data) setMessages(messagesResult.data);
      if (conversationsResult.data) {
        setConversations(conversationsResult.data);
        setActiveId((current) => current ?? conversationsResult.data?.[0]?.id ?? null);
      }
    }

    void recoverLiveUpdates();
    const interval = window.setInterval(() => void recoverLiveUpdates(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [organizationId]);

  useEffect(() => {
    if (!activeId) return;
    const supabase = createClient();
    let cancelled = false;

    async function refreshStatuses() {
      const { data } = await supabase
        .from("messages")
        .select("id,external_id,status")
        .eq("organization_id", organizationId)
        .eq("conversation_id", activeId);
      if (cancelled || !data) return;
      const updates = new Map(data.map((item) => [item.id, item]));
      setMessages((current) => current.map((message) => {
        const update = updates.get(message.id);
        return update ? { ...message, ...update } : message;
      }));
    }

    void refreshStatuses();
    const interval = window.setInterval(() => void refreshStatuses(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeId, organizationId]);

  useEffect(() => {
    const interval = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const contactByAddress = useMemo(() => {
    const contactMap = new Map(contactRows.map((item) => [item.id, item]));
    return new Map(addressRows.map((item) => [item.address, {
      address: item,
      contact: item.contact_id ? contactMap.get(item.contact_id) ?? null : null,
    }]));
  }, [addressRows, contactRows]);
  const messagesByConversation = useMemo(() => {
    const map = new Map<string, Message[]>();
    messages.forEach((message) => map.set(message.conversation_id, [...(map.get(message.conversation_id) ?? []), message]));
    return map;
  }, [messages]);
  const rows = useMemo(() => conversations.filter((conversation) => {
    const linked = conversation.contact_address ? contactByAddress.get(conversation.contact_address) : null;
    const name = linked?.contact?.name ?? conversation.name ?? conversation.contact_address ?? "Unknown contact";
    return `${name} ${conversation.contact_address ?? ""}`.toLowerCase().includes(query.trim().toLowerCase());
  }).sort((a, b) => {
    const aLast = messagesByConversation.get(a.id)?.at(-1)?.timestamp ?? a.updated_at;
    const bLast = messagesByConversation.get(b.id)?.at(-1)?.timestamp ?? b.updated_at;
    return new Date(bLast).getTime() - new Date(aLast).getTime();
  }), [conversations, contactByAddress, messagesByConversation, query]);
  const active = conversations.find((item) => item.id === activeId) ?? null;
  const thread = active ? messagesByConversation.get(active.id) ?? [] : [];
  const linked = active?.contact_address ? contactByAddress.get(active.contact_address) : null;
  const activeName = linked?.contact?.name ?? active?.name ?? active?.contact_address ?? "Unknown contact";
  const assigned = agents.find((agent) => agent.id === active?.assigned_agent_id) ?? null;
  const latestIncoming = [...thread].reverse().find((message) => message.direction === "incoming");
  const serviceWindowEndsAt = latestIncoming ? new Date(latestIncoming.timestamp).getTime() + 24 * 60 * 60 * 1000 : 0;
  const serviceWindowOpen = serviceWindowEndsAt > clock;

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [activeId, thread.length]);

  function selectConversation(id: string) {
    setActiveId(id);
    setMobilePanel("thread");
    setDraft("");
    setAiSuggestion(null);
    setError("");
  }

  function openTemplateComposer(useActiveContact = false) {
    setError("");
    setTemplateTarget(useActiveContact && active?.contact_address
      ? { phone: active.contact_address, name: activeName }
      : null);
    setNewConversationOpen(true);
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!active || !draft.trim() || sending) return;
    setSending(true);
    setError("");
    const response = await fetch("/api/conversations/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: active.id, text: draft.trim() }),
    });
    const result = await response.json().catch(() => ({})) as { message?: Message; error?: string; code?: string };
    if (!response.ok || !result.message) {
      setError(result.error ?? "Message could not be sent.");
      if (result.code === "WHATSAPP_SERVICE_WINDOW_CLOSED") setClock(() => Date.now());
    } else {
      setMessages((current) => [...current.filter((item) => item.id !== result.message!.id), result.message!]);
      setConversations((current) => current.map((item) => item.id === active.id ? { ...item, ai_paused: true, updated_at: new Date().toISOString() } : item));
      setDraft("");
    }
    setSending(false);
  }

  async function updateConversation(update: { assignedAgentId?: string | null; aiPaused?: boolean }) {
    if (!active) return;
    setError("");
    const response = await fetch("/api/conversations/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: active.id, ...update }),
    });
    const result = await response.json().catch(() => ({})) as { conversation?: Conversation; error?: string };
    if (!response.ok || !result.conversation) return setError(result.error ?? "Conversation could not be updated.");
    setConversations((current) => current.map((item) => item.id === result.conversation!.id ? result.conversation! : item));
  }

  async function suggestReply() {
    if (!active || suggesting) return;
    const latestIncoming = [...thread].reverse().find((message) => message.direction === "incoming");
    const patientQuestion = latestIncoming ? textFromContent(latestIncoming.content) : "";
    if (!patientQuestion || patientQuestion === "Message" || patientQuestion.startsWith("Attachment")) {
      setError("A text message from the patient is required before the concierge can suggest a reply.");
      return;
    }
    setSuggesting(true);
    setAiSuggestion(null);
    setError("");
    const response = await fetch("/api/agents/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: patientQuestion }),
    });
    const result = await response.json().catch(() => ({})) as AiSuggestion & { error?: string };
    if (!response.ok || !result.answer) setError(result.error ?? "The concierge could not prepare a safe draft.");
    else setAiSuggestion(result);
    setSuggesting(false);
  }

  async function saveContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!active?.contact_address || savingContact) return;
    setSavingContact(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/contacts/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId: object(linked?.contact?.extra).patient_id,
        contactAddress: active.contact_address,
        fullName: data.get("fullName"),
        email: data.get("email"),
        age: data.get("age") ? Number(data.get("age")) : null,
        locality: data.get("locality"),
        pincode: data.get("pincode"),
        healthConcern: data.get("healthConcern"),
        careConsent: data.get("careConsent") === "on",
        marketingConsent: data.get("marketingConsent") === "on",
      }),
    });
    const result = await response.json().catch(() => ({})) as { contact?: Contact; address?: ContactAddress; error?: string };
    if (!response.ok || !result.contact || !result.address) {
      setError(result.error ?? "Contact could not be saved.");
    } else {
      setContactRows((current) => [...current.filter((item) => item.id !== result.contact!.id), result.contact!]);
      setAddressRows((current) => [...current.filter((item) => item.address !== result.address!.address), result.address!]);
      setContactEditorOpen(false);
    }
    setSavingContact(false);
  }

  async function startConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (startingConversation) return;
    setStartingConversation(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/conversations/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: data.get("phone"),
        name: data.get("name"),
        templateId: data.get("templateId"),
        templateVariables: Object.fromEntries([...data.entries()]
          .filter(([key]) => key.startsWith("variable:"))
          .map(([key, value]) => [key.slice(9), String(value)])),
        consentSource: data.get("consentSource"),
        consentConfirmed: data.get("consentConfirmed") === "on",
      }),
    });
    const result = await response.json().catch(() => ({})) as {
      conversation?: Conversation; message?: Message; contact?: Contact; address?: ContactAddress; error?: string;
    };
    if (!response.ok || !result.conversation || !result.message || !result.contact || !result.address) {
      setError(result.error ?? "Conversation could not be started.");
    } else {
      setConversations((current) => [result.conversation!, ...current.filter((item) => item.id !== result.conversation!.id)]);
      setMessages((current) => [...current.filter((item) => item.id !== result.message!.id), result.message!]);
      setContactRows((current) => [...current.filter((item) => item.id !== result.contact!.id), result.contact!]);
      setAddressRows((current) => [...current.filter((item) => item.address !== result.address!.address), result.address!]);
      selectConversation(result.conversation.id);
      setNewConversationOpen(false);
    }
    setStartingConversation(false);
  }

  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? null;
  const selectedVariables = Object.entries(selectedTemplate?.variable_map ?? {})
    .sort(([left], [right]) => Number(left) - Number(right));
  const variableDefault = (name: string) => {
    if (name === "patient_name") return templateTarget?.name ?? "";
    if (name === "business_name") return organizationName;
    return "";
  };

  if (!connection || !["test", "live"].includes(connection.status)) {
    return <main className="inbox-connect-state"><span className="app-eyebrow">SHARED INBOX</span><h2>Connect WhatsApp to open your inbox.</h2><p>Incoming customer messages, booking context and human handoffs will appear here after the channel is live.</p><a href="/app/integrations">Connect WhatsApp →</a></main>;
  }

  return <main className="flex h-[calc(100vh-5.5rem)] min-h-[42rem] flex-col overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-marble">
    <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border bg-panel px-4 py-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-2 text-sm"><span className={`h-2 w-2 shrink-0 rounded-full ${realtimeStatus === "live" ? "bg-teal" : "bg-amber-500"}`}/><span className="truncate font-semibold">{connection.display_name ?? "WhatsApp Business"}</span><span className="hidden text-muted-foreground sm:inline">· {connection.display_address ?? "Connected"}</span>{realtimeStatus !== "live"&&<span className="hidden text-xs text-muted-foreground md:inline">· Live updates reconnecting</span>}</div>
      <button type="button" className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition hover:opacity-90" onClick={()=>openTemplateComposer(false)}>New conversation</button>
    </header>
    <section className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[19rem_minmax(0,1fr)_20rem]">
      <aside className={`${mobilePanel === "thread" ? "hidden" : "flex"} min-h-0 flex-col border-r border-border bg-panel lg:flex`}>
        <div className="border-b border-border p-3">
          <label className="flex items-center gap-2 rounded-xl border border-input bg-background px-3 py-2 text-muted-foreground focus-within:ring-2 focus-within:ring-ring" aria-label="Search conversations"><CircleHelp className="h-4 w-4"/><input className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search conversations"/></label>
          <div className="mt-4"><p className="mb-2 text-xs font-semibold text-muted-foreground">Frequent contacts</p><div className="flex gap-2 overflow-x-auto pb-1" aria-label="Frequent contacts">{rows.slice(0,5).map((conversation)=>{const contact=conversation.contact_address?contactByAddress.get(conversation.contact_address):null;const name=contact?.contact?.name??conversation.name??"Contact";return <button type="button" className={`flex shrink-0 flex-col items-center gap-1 rounded-lg px-1.5 py-1 text-xs text-muted-foreground transition hover:bg-accent hover:text-accent-foreground ${activeId===conversation.id?"bg-accent text-accent-foreground":""}`} key={conversation.id} onClick={()=>selectConversation(conversation.id)}><span className="grid h-8 w-8 place-items-center rounded-full bg-secondary font-bold text-secondary-foreground">{name.slice(0,1).toUpperCase()}</span><span className="max-w-14 truncate">{name.split(" ")[0]}</span></button>})}</div></div>
        </div>
        <div className="flex items-center justify-between border-b border-border px-4 py-3"><span className="text-xs font-semibold">Conversations</span><span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">{rows.length}</span></div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {rows.length === 0 && <div className="p-5 text-center text-sm text-muted-foreground">Your inbox is ready. New WhatsApp conversations will appear here.</div>}
          {rows.map((conversation) => {const last=messagesByConversation.get(conversation.id)?.at(-1);const contact=conversation.contact_address?contactByAddress.get(conversation.contact_address):null;const name=contact?.contact?.name??conversation.name??conversation.contact_address??"Unknown contact";return <button className={`mb-1 grid min-h-14 w-full grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-2 rounded-xl px-2 py-2.5 text-left transition ${activeId===conversation.id?"bg-accent text-accent-foreground":"hover:bg-muted"}`} onClick={()=>selectConversation(conversation.id)} key={conversation.id}><span className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground">{name.slice(0,1).toUpperCase()}</span><span className="min-w-0"><span className="block truncate text-sm font-semibold">{name}</span><span className="block truncate text-xs text-muted-foreground">{last?textFromContent(last.content):"Conversation started"}</span></span><time className="self-start text-xs text-muted-foreground">{timeLabel(last?.timestamp??conversation.updated_at)}</time></button>;})}
        </div>
      </aside>
      <section className={`${mobilePanel === "list" ? "hidden" : "flex"} min-h-0 flex-col bg-background lg:flex`}>
        {!active ? <div className="grid flex-1 place-items-center p-8 text-center"><div><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-secondary text-secondary-foreground"><SendHorizontal className="h-5 w-5"/></span><h2 className="mt-4 text-lg font-semibold">Select a conversation</h2><p className="mt-1 text-sm text-muted-foreground">Customer messages and booking context will appear here.</p></div></div> : <>
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-panel px-4 py-3">
            <div className="flex min-w-0 items-center gap-3"><button className="rounded-md p-1 text-muted-foreground hover:bg-muted lg:hidden" type="button" onClick={()=>setMobilePanel("list")} aria-label="Back to conversations">←</button><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary font-bold text-secondary-foreground">{activeName.slice(0,1).toUpperCase()}</span><span className="min-w-0"><b className="block truncate text-sm">{activeName}</b><small className="block truncate text-xs text-muted-foreground">{active.ai_paused?"Human takeover active":"AI assist ready"} · WhatsApp</small></span></div>
            <div className="flex items-center gap-1"><button type="button" className="rounded-md p-2 text-muted-foreground hover:bg-muted" aria-label="Call patient" title="Calling is not enabled"><Phone className="h-4 w-4"/></button><button type="button" className="rounded-md p-2 text-muted-foreground hover:bg-muted" aria-label="Video call" title="Video calling is not enabled"><Video className="h-4 w-4"/></button><button type="button" className="rounded-md p-2 text-muted-foreground hover:bg-muted" aria-label="Patient information"><Info className="h-4 w-4"/></button><select className="hidden rounded-md border border-input bg-panel px-2 py-1.5 text-xs outline-none sm:block" aria-label="Assign conversation" value={active.assigned_agent_id ?? ""} onChange={(event)=>void updateConversation({assignedAgentId:event.target.value||null})}><option value="">Unassigned</option>{agents.filter((agent)=>!agent.ai).map((agent)=><option value={agent.id} key={agent.id}>{agent.name}</option>)}</select><button type="button" className={`hidden rounded-md px-2.5 py-1.5 text-xs font-semibold sm:block ${active.ai_paused?"bg-accent text-accent-foreground":"bg-secondary text-secondary-foreground"}`} onClick={()=>void updateConversation({aiPaused:!active.ai_paused})}>{active.ai_paused?"Human takeover":"AI assist"}</button></div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="mx-auto max-w-3xl"><p className="mb-5 text-center text-xs text-muted-foreground">Conversation history</p>{thread.map((message)=>{const delivery=deliveryPresentation(message.status);const failure=whatsappFailure(message.status);const outgoing=message.direction==="outgoing";const origin=messageOrigin(message);return <article className={`mb-3 flex ${outgoing?"justify-end":"justify-start"}`} key={message.id}><div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${outgoing?"rounded-br-md bg-primary text-primary-foreground":"rounded-bl-md border border-border bg-panel"}`}><span className={`mb-1 block text-xs font-semibold ${outgoing?"text-primary-foreground/75":"text-muted-foreground"}`}>{origin}</span><p className="whitespace-pre-wrap leading-6">{textFromContent(message.content)}</p><footer className={`mt-1 flex items-center gap-1 text-xs ${outgoing?"text-primary-foreground/75":"text-muted-foreground"}`}><time>{timeLabel(message.timestamp)}</time>{outgoing&&<span title={delivery.label} aria-label={`Message ${delivery.label.toLowerCase()}`}>{delivery.icon} {delivery.label}</span>}</footer>{failure&&<aside className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-xs text-foreground"><b>{failure.title}</b><p className="mt-1">{failure.action}</p><a className="mt-1 inline-block font-semibold text-primary" href="/app/operations">Review operations →</a></aside>}</div></article>;})}<div ref={endRef}/></div>
          </div>
          <form className="shrink-0 border-t border-border bg-panel p-3 sm:p-4" onSubmit={send}>
            {active.ai_paused&&<p className="mb-2 text-xs font-medium text-accent-foreground">AI is paused while your team handles this conversation.</p>}{error&&<p className="mb-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
            <div className="mb-2 flex items-center justify-between gap-3"><button type="button" className="text-xs font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-50" disabled={suggesting||!serviceWindowOpen} onClick={()=>void suggestReply()}>{suggesting?"Checking approved knowledge…":"Suggest safe reply"}</button><span className="text-xs text-muted-foreground">Nothing is sent automatically.</span></div>
            {aiSuggestion&&<aside className="mb-3 rounded-xl border border-border bg-muted p-3 text-sm"><div className="flex items-start justify-between gap-2"><div><b>{aiSuggestion.classification==="business_answer"?"Grounded draft":aiSuggestion.classification==="urgent"?"Urgent escalation":aiSuggestion.classification==="clinical_handoff"?"Clinical handoff":"Human handoff"}</b><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{aiSuggestion.answer}</p></div><button type="button" className="text-muted-foreground" onClick={()=>setAiSuggestion(null)} aria-label="Dismiss AI suggestion">×</button></div><button type="button" className="mt-2 text-xs font-semibold text-primary" onClick={()=>{setDraft(aiSuggestion.answer);setAiSuggestion(null)}}>Use as editable draft</button></aside>}
            {serviceWindowOpen?<><div className="flex items-center gap-2 rounded-full border border-input bg-background p-1.5 pl-3 shadow-sm focus-within:ring-2 focus-within:ring-ring"><button type="button" disabled className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground disabled:cursor-not-allowed" title="Attachments are not enabled" aria-label="Attachments are not enabled"><Paperclip className="h-4 w-4"/></button><textarea className="max-h-28 min-h-8 flex-1 resize-none bg-transparent py-1.5 text-sm leading-5 outline-none placeholder:text-muted-foreground" aria-label="Reply message" value={draft} onChange={(event)=>setDraft(event.target.value)} placeholder="Write a WhatsApp reply…" rows={1}/><button type="button" disabled className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground disabled:cursor-not-allowed" title="Emoji reactions are not enabled" aria-label="Emoji reactions are not enabled"><Smile className="h-4 w-4"/></button><button className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Send message" disabled={!draft.trim()||sending}>{sending?"…":<SendHorizontal className="h-4 w-4"/>}</button></div><p className="mt-2 text-xs text-muted-foreground">Free-form replies are available until {new Intl.DateTimeFormat("en-IN",{day:"numeric",month:"short",hour:"numeric",minute:"2-digit"}).format(new Date(serviceWindowEndsAt))}.</p></>:<div className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm"><span><b className="block">24-hour reply window closed</b><small className="text-muted-foreground">Use an approved template to contact this patient again.</small></span><button type="button" className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground" onClick={()=>openTemplateComposer(true)}>Send template</button></div>}
          </form>
        </>}
      </section>
      <aside className="hidden min-h-0 overflow-y-auto border-l border-border bg-panel lg:block">
        {active?<div className="p-4"><div className="border-b border-border pb-4 text-center"><span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-secondary text-xl font-bold text-secondary-foreground">{activeName.slice(0,1).toUpperCase()}</span><h2 className="mt-3 text-base font-semibold">{activeName}</h2><p className="mt-1 text-xs text-muted-foreground">{active.ai_paused?"Human takeover active":"AI assist ready"}</p></div>
          <Tabs.Root defaultValue="info" className="mt-4"><Tabs.List className="grid grid-cols-3 rounded-lg bg-muted p-1" aria-label="Patient context"><Tabs.Trigger value="info" className="rounded-md px-2 py-1.5 text-xs font-semibold text-muted-foreground data-[state=active]:bg-panel data-[state=active]:text-foreground data-[state=active]:shadow-sm">Info</Tabs.Trigger><Tabs.Trigger value="files" className="rounded-md px-2 py-1.5 text-xs font-semibold text-muted-foreground data-[state=active]:bg-panel data-[state=active]:text-foreground data-[state=active]:shadow-sm">Files</Tabs.Trigger><Tabs.Trigger value="care" className="rounded-md px-2 py-1.5 text-xs font-semibold text-muted-foreground data-[state=active]:bg-panel data-[state=active]:text-foreground data-[state=active]:shadow-sm">Care</Tabs.Trigger></Tabs.List>
            <Tabs.Content value="info" className="mt-4"><Accordion.Root type="multiple" defaultValue={["general","appointments"]} className="divide-y divide-border rounded-xl border border-border"><Accordion.Item value="general"><Accordion.Header><Accordion.Trigger className="flex w-full items-center justify-between px-3 py-3 text-left text-sm font-semibold">General information <ChevronDown className="h-4 w-4 text-muted-foreground transition data-[state=open]:rotate-180"/></Accordion.Trigger></Accordion.Header><Accordion.Content className="px-3 pb-3 text-sm text-muted-foreground"><div className="grid grid-cols-[1rem_1fr] gap-x-2 gap-y-2"><Phone className="h-4 w-4"/><span>{active.contact_address ?? "No WhatsApp number"}</span><MapPin className="h-4 w-4"/><span>{String(object(linked?.contact?.extra).locality??"Location not added")}</span><Info className="h-4 w-4"/><span>{assigned?.name??"Unassigned"} · {active.status}</span></div></Accordion.Content></Accordion.Item><Accordion.Item value="appointments"><Accordion.Header><Accordion.Trigger className="flex w-full items-center justify-between px-3 py-3 text-left text-sm font-semibold">Upcoming appointments <ChevronDown className="h-4 w-4 text-muted-foreground transition data-[state=open]:rotate-180"/></Accordion.Trigger></Accordion.Header><Accordion.Content className="px-3 pb-3 text-sm text-muted-foreground"><p>Open the appointment workspace to view confirmed booking details.</p><a className="mt-2 inline-block text-xs font-semibold text-primary" href="/app/appointments">Open appointments →</a></Accordion.Content></Accordion.Item><Accordion.Item value="payments"><Accordion.Header><Accordion.Trigger className="flex w-full items-center justify-between px-3 py-3 text-left text-sm font-semibold">Payment links <ChevronDown className="h-4 w-4 text-muted-foreground transition data-[state=open]:rotate-180"/></Accordion.Trigger></Accordion.Header><Accordion.Content className="px-3 pb-3 text-sm text-muted-foreground"><p>Payment status remains in the protected payment workflow.</p><a className="mt-2 inline-block text-xs font-semibold text-primary" href="/app/appointments">Open payment workflow →</a></Accordion.Content></Accordion.Item></Accordion.Root></Tabs.Content>
            <Tabs.Content value="files" className="mt-4 rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground"><FileText className="mx-auto h-5 w-5"/><p className="mt-2">No files shared in this conversation.</p></Tabs.Content>
            <Tabs.Content value="care" className="mt-4"><Accordion.Root type="single" collapsible defaultValue="plan" className="rounded-xl border border-border"><Accordion.Item value="plan"><Accordion.Header><Accordion.Trigger className="flex w-full items-center justify-between px-3 py-3 text-left text-sm font-semibold">Care plan <ChevronDown className="h-4 w-4 text-muted-foreground transition data-[state=open]:rotate-180"/></Accordion.Trigger></Accordion.Header><Accordion.Content className="px-3 pb-3 text-sm text-muted-foreground"><p>Care communication: {object(linked?.contact?.extra).care_communications_consent===false?"not allowed":"allowed"}.</p><a className="mt-2 inline-block text-xs font-semibold text-primary" href="/app/care-plans">Open care plans →</a></Accordion.Content></Accordion.Item></Accordion.Root></Tabs.Content>
          </Tabs.Root><button className="mt-4 w-full rounded-lg border border-input px-3 py-2 text-sm font-semibold hover:bg-muted" onClick={()=>{setError("");setContactEditorOpen(true)}}>{linked?.contact?"Edit contact":"Save contact"}</button></div>:<p className="p-4 text-sm text-muted-foreground">Select a conversation to see patient context.</p>}
      </aside>
    </section>
    {active&&contactEditorOpen&&<div className="contact-editor-backdrop" onClick={()=>setContactEditorOpen(false)}><form className="contact-editor" onSubmit={saveContact} onClick={(event)=>event.stopPropagation()}>
      <header><div><span className="app-eyebrow">{linked?.contact?"EDIT CONTACT":"SAVE CONTACT"}</span><h3>{active.contact_address}</h3></div><button type="button" onClick={()=>setContactEditorOpen(false)}>×</button></header>
      <label>Full name<input name="fullName" required defaultValue={linked?.contact?.name??active.name??""}/></label>
      <label>Email<input name="email" type="email" defaultValue={String(object(linked?.contact?.extra).email??"")}/></label>
      <div className="contact-editor-row"><label>Age<input name="age" type="number" min="0" max="120" defaultValue={String(object(linked?.contact?.extra).age??"")}/></label><label>PIN code<input name="pincode" inputMode="numeric" pattern="[0-9]{6}" defaultValue={String(object(linked?.contact?.extra).pincode??"")}/></label></div>
      <label>Location<input name="locality" defaultValue={String(object(linked?.contact?.extra).locality??"")}/></label>
      <label>Health concern<input name="healthConcern" defaultValue={String(object(linked?.contact?.extra).health_concern??"")}/></label>
      <label className="contact-consent"><input name="careConsent" type="checkbox" defaultChecked={object(linked?.contact?.extra).care_communications_consent!==false}/><span><b>Care communication consent</b><small>Booking, revisit and medication reminders</small></span></label>
      <label className="contact-consent"><input name="marketingConsent" type="checkbox" defaultChecked={object(linked?.contact?.extra).marketing_consent===true}/><span><b>Marketing consent</b><small>Education, offers and broadcast campaigns</small></span></label>
      {error&&<p>{error}</p>}
      <button className="contact-editor-save" disabled={savingContact}>{savingContact?"Saving…":linked?.contact?"Save changes":"Save contact"}</button>
    </form></div>}
    {newConversationOpen&&<div className="contact-editor-backdrop" onClick={()=>setNewConversationOpen(false)}><form key={`${templateTarget?.phone??"new"}-${activeId??"none"}`} className="contact-editor outbound-editor" onSubmit={startConversation} onClick={(event)=>event.stopPropagation()}>
      <header><div><span className="app-eyebrow">OUTBOUND WHATSAPP</span><h3>Start a conversation</h3></div><button type="button" onClick={()=>setNewConversationOpen(false)}>×</button></header>
      <p className="outbound-policy-note">WhatsApp requires an approved template to start a conversation. Free-form replies unlock after the customer responds.</p>
      <label>Mobile number with country code<input name="phone" inputMode="tel" placeholder="919831582626" required pattern="[+0-9 ()-]{10,20}" defaultValue={templateTarget?.phone??""}/></label>
      <label>Contact name<input name="name" placeholder="Customer name" defaultValue={templateTarget?.name??""}/></label>
      <label>Approved template<select name="templateId" required value={selectedTemplateId} onChange={(event)=>setSelectedTemplateId(event.target.value)}>
        <option value="" disabled>Select an approved template</option>
        {connection.status==="test"&&<option value="hello_world">Meta test message · hello_world</option>}
        {templates.map((template)=><option value={template.id} key={template.id}>{template.event_type.replaceAll("_"," ")} · {template.provider_template_name}</option>)}
      </select></label>
      {selectedTemplateId!=="hello_world"&&selectedVariables.map(([position,name])=><label key={position}>{name.replaceAll("_"," ")}<input name={`variable:${position}`} required defaultValue={variableDefault(name)} placeholder={`Value for {{${position}}}`}/></label>)}
      <label>Consent source<select name="consentSource" required defaultValue=""><option value="" disabled>Select how consent was received</option><option value="customer_request">Customer requested contact</option><option value="booking_form">Booking form opt-in</option><option value="written">Written consent</option><option value="existing_relationship">Existing customer relationship</option></select></label>
      <label className="contact-consent"><input name="consentConfirmed" type="checkbox" required/><span><b>I confirm this person agreed to receive WhatsApp messages</b><small>OmniRelay records the source, time and team member for audit purposes.</small></span></label>
      {error&&<p>{error}</p>}
      <button className="contact-editor-save" disabled={startingConversation}>{startingConversation?"Starting…":"Send approved template"}</button>
    </form></div>}
  </main>;
}
