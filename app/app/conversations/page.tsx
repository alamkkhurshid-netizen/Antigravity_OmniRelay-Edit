import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/workspace";
import { ConversationWorkspace } from "./conversation-workspace";

export default async function ConversationsPage() {
  const { supabase, organization } = await getWorkspace();
  if (!organization) redirect("/onboarding");

  const [
    { data: conversations },
    { data: messages },
    { data: contactAddresses },
    { data: contacts },
    { data: agents },
    { data: connection },
    { data: templates },
  ] = await Promise.all([
    supabase
      .from("conversations")
      .select("id,service,organization_address,contact_address,name,status,ai_paused,paused_at,assigned_agent_id,extra,created_at,updated_at")
      .eq("organization_id", organization.id)
      .order("updated_at", { ascending: false })
      .limit(100),
    supabase
      .from("messages")
      .select("id,conversation_id,external_id,direction,content,status,timestamp,agent_id")
      .eq("organization_id", organization.id)
      .order("timestamp", { ascending: true })
      .limit(1000),
    supabase
      .from("contacts_addresses")
      .select("address,contact_id,extra,status")
      .eq("organization_id", organization.id)
      .eq("service", "whatsapp"),
    supabase
      .from("contacts")
      .select("id,name,status,extra")
      .eq("organization_id", organization.id),
    supabase
      .from("agents")
      .select("id,name,picture,ai,user_id")
      .eq("organization_id", organization.id),
    supabase
      .from("channel_connections")
      .select("status,display_name,display_address")
      .eq("organization_id", organization.id)
      .eq("channel", "whatsapp")
      .maybeSingle(),
    supabase
      .from("channel_message_templates")
      .select("id,event_type,provider_template_name,language_code,status,variable_map")
      .eq("organization_id", organization.id)
      .eq("channel", "whatsapp")
      .eq("status", "approved")
      .order("event_type"),
  ]);

  return (
    <ConversationWorkspace
      organizationId={organization.id}
      initialConversations={conversations ?? []}
      initialMessages={messages ?? []}
      contactAddresses={contactAddresses ?? []}
      contacts={contacts ?? []}
      agents={agents ?? []}
      connection={connection}
      templates={templates ?? []}
      organizationName={organization.name}
    />
  );
}
