export type Json = Record<string, unknown> | null;

export type Conversation = {
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

export type Message = {
  id: string;
  conversation_id: string;
  external_id: string | null;
  direction: "incoming" | "outgoing" | "internal";
  content: Json;
  status: Json;
  timestamp: string;
  agent_id: string | null;
};

export type ContactAddress = { address: string; contact_id: string | null; extra: Json; status: string };
export type Contact = { id: string; name: string | null; status: string; extra: Json };
export type Agent = { id: string; name: string; picture: string | null; ai: boolean; user_id: string | null };
export type Connection = { status: string; display_name: string | null; display_address: string | null } | null;
export type Template = { id: string; event_type: string; provider_template_name: string; language_code: string; status: string; variable_map: Record<string, string> | null };

export type AiSuggestion = {
  answer: string;
  confidence: "grounded" | "limited" | "handoff";
  classification: "business_answer" | "clinical_handoff" | "urgent" | "no_source";
  sources: { id: string; title: string; sourceType: string; updatedAt: string }[];
  safety: string;
};
