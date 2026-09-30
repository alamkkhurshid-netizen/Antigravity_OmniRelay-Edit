import { FormEvent, useEffect, useMemo, useState } from "react";
import { AiSuggestion, Contact, ContactAddress, Conversation, Message } from "./types";
import { object, textFromContent } from "./utils";
import { useRealtimeMessages } from "./use-realtime-messages";

export function useConversationWorkspace(
  organizationId: string,
  initialConversations: Conversation[],
  initialMessages: Message[],
  initialContactAddresses: ContactAddress[],
  initialContacts: Contact[]
) {
  const [activeId, setActiveId] = useState(initialConversations[0]?.id ?? null);
  const { conversations, setConversations, messages, setMessages, realtimeStatus } = useRealtimeMessages(organizationId, activeId, initialConversations, initialMessages);
  
  const [contactRows, setContactRows] = useState(initialContacts);
  const [addressRows, setAddressRows] = useState(initialContactAddresses);
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
  const linked = active?.contact_address ? (contactByAddress.get(active.contact_address) ?? null) : null;
  const activeName = linked?.contact?.name ?? active?.name ?? active?.contact_address ?? "Unknown contact";

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

  return {
    activeId, setActiveId, realtimeStatus,
    query, setQuery, draft, setDraft,
    sending, setSending, contactEditorOpen, setContactEditorOpen,
    newConversationOpen, setNewConversationOpen, startingConversation,
    savingContact, suggesting, aiSuggestion, setAiSuggestion,
    error, setError, mobilePanel, setMobilePanel, clock,
    templateTarget, setTemplateTarget, selectedTemplateId, setSelectedTemplateId,
    contactByAddress, messagesByConversation, rows, active, thread, linked, activeName,
    selectConversation, openTemplateComposer, send, updateConversation, suggestReply,
    saveContact, startConversation
  };
}
