import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";

export async function POST(request: Request) {
  const { supabase, organization } = await getWorkspace();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!organization) return NextResponse.json({ error: "Workspace not found." }, { status: 409 });

  const payload = await request.json().catch(() => ({})) as { conversationId?: string; text?: string };
  const text = payload.text?.trim();
  if (!payload.conversationId || !text) return NextResponse.json({ error: "Conversation and message are required." }, { status: 400 });
  if (text.length > 4096) return NextResponse.json({ error: "WhatsApp replies cannot exceed 4,096 characters." }, { status: 400 });

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id,organization_id,service,organization_address,contact_address,group_address,status")
    .eq("id", payload.conversationId)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!conversation || conversation.status !== "active") return NextResponse.json({ error: "Active conversation not found." }, { status: 404 });
  if (conversation.service !== "whatsapp" || !conversation.contact_address) return NextResponse.json({ error: "This conversation cannot receive a WhatsApp reply." }, { status: 400 });

  const { data: latestIncoming, error: incomingError } = await supabase
    .from("messages")
    .select("timestamp")
    .eq("organization_id", organization.id)
    .eq("conversation_id", conversation.id)
    .eq("direction", "incoming")
    .order("timestamp", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (incomingError) return NextResponse.json({ error: "The WhatsApp reply window could not be verified." }, { status: 503 });
  const incomingAt = latestIncoming?.timestamp ? new Date(latestIncoming.timestamp).getTime() : Number.NaN;
  const serviceWindowOpen = Number.isFinite(incomingAt) && Date.now() - incomingAt < 24 * 60 * 60 * 1000;
  if (!serviceWindowOpen) {
    return NextResponse.json({
      code: "WHATSAPP_SERVICE_WINDOW_CLOSED",
      error: "The 24-hour WhatsApp reply window is closed. Send an approved template to continue.",
    }, { status: 409 });
  }

  const { data: agent } = await supabase
    .from("agents")
    .select("id")
    .eq("organization_id", organization.id)
    .eq("user_id", user.id)
    .eq("ai", false)
    .maybeSingle();

  const { data: message, error } = await supabase
    .from("messages")
    .insert({
      organization_id: organization.id,
      conversation_id: conversation.id,
      service: "whatsapp",
      organization_address: conversation.organization_address,
      contact_address: conversation.contact_address,
      group_address: conversation.group_address,
      direction: "outgoing",
      agent_id: agent?.id ?? null,
      content: { version: "1", type: "text", kind: "text", text },
    })
    .select("id,conversation_id,external_id,direction,content,status,timestamp,agent_id")
    .single();
  if (error || !message) return NextResponse.json({ error: error?.message ?? "Message could not be queued." }, { status: 400 });
  return NextResponse.json({ message });
}
