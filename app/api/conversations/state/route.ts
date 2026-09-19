import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";

export async function POST(request: Request) {
  const { supabase, organization } = await getWorkspace();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!organization) return NextResponse.json({ error: "Workspace not found." }, { status: 409 });

  const payload = await request.json().catch(() => ({})) as {
    conversationId?: string;
    assignedAgentId?: string | null;
    aiPaused?: boolean;
  };
  if (!payload.conversationId) return NextResponse.json({ error: "Conversation is required." }, { status: 400 });

  const update: Record<string, unknown> = {};
  if ("assignedAgentId" in payload) {
    if (payload.assignedAgentId) {
      const { data: agent } = await supabase.from("agents").select("id").eq("id", payload.assignedAgentId).eq("organization_id", organization.id).eq("ai", false).maybeSingle();
      if (!agent) return NextResponse.json({ error: "Agent is not available in this workspace." }, { status: 400 });
    }
    update.assigned_agent_id = payload.assignedAgentId ?? null;
  }
  if (typeof payload.aiPaused === "boolean") {
    update.ai_paused = payload.aiPaused;
    update.paused_at = payload.aiPaused ? new Date().toISOString() : null;
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "No change requested." }, { status: 400 });

  const { data: conversation, error } = await supabase
    .from("conversations")
    .update(update)
    .eq("id", payload.conversationId)
    .eq("organization_id", organization.id)
    .select("id,service,organization_address,contact_address,name,status,ai_paused,paused_at,assigned_agent_id,extra,created_at,updated_at")
    .single();
  if (error || !conversation) return NextResponse.json({ error: error?.message ?? "Conversation could not be updated." }, { status: 400 });
  return NextResponse.json({ conversation });
}
