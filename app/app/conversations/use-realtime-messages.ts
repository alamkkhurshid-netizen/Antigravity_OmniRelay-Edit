import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type RealtimeStatus = "connecting" | "live" | "reconnecting";

export function useRealtimeMessages(
  organizationId: string,
  activeId: string | null,
  initialConversations: any[],
  initialMessages: any[]
) {
  const [conversations, setConversations] = useState(initialConversations);
  const [messages, setMessages] = useState(initialMessages);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("connecting");

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`inbox:${organizationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `organization_id=eq.${organizationId}` }, (event) => {
        const next = event.new as any;
        if (!next?.id) return;
        setMessages((current) => [...current.filter((item) => item.id !== next.id), next]
          .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: `organization_id=eq.${organizationId}` }, (event) => {
        const next = event.new as any;
        if (!next?.id) return;
        setConversations((current) => [next, ...current.filter((item) => item.id !== next.id)]);
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

  return {
    conversations,
    setConversations,
    messages,
    setMessages,
    realtimeStatus,
  };
}
