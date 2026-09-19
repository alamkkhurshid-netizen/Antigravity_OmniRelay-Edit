import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // MCP Server auth - ensure caller is authorized
    if (!user) {
      // In a real MCP we might check an API token here, 
      // but since the AI operates on behalf of the logged-in user in this POC:
      return NextResponse.json({ error: "Unauthorized access to Meta MCP." }, { status: 401 });
    }

    const { action, parameters } = await req.json();

    const { data: profile } = await supabase
      .from("onboarding_profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "Organization not found." }, { status: 404 });
    }

    const orgId = profile.organization_id;

    // Dispatcher
    switch (action) {
      case "get_campaign_metrics":
        return await handleGetMetrics(supabase, orgId);
      
      case "pause_campaign":
        return await handlePauseCampaign(supabase, orgId, parameters?.campaign_id);

      default:
        return NextResponse.json({ error: `Unknown MCP action: ${action}` }, { status: 400 });
    }

  } catch (error: any) {
    console.error("[Meta MCP Error]", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

// --------------------------------------------------------
// MCP Skill implementations
// --------------------------------------------------------

async function handleGetMetrics(supabase: any, orgId: string) {
  const { data: campaigns, error } = await supabase
    .from("marketing_campaigns")
    .select("id, campaign_name, status, daily_budget, roas, updated_at")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // MCP Servers typically return structured context blocks
  return NextResponse.json({
    status: "success",
    content: [
      {
        type: "text",
        text: JSON.stringify(campaigns, null, 2)
      }
    ]
  });
}

async function handlePauseCampaign(supabase: any, orgId: string, campaignId: string) {
  if (!campaignId) {
    return NextResponse.json({ error: "campaign_id is required." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("marketing_campaigns")
    .update({ status: "paused" })
    .eq("id", campaignId)
    .eq("organization_id", orgId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    status: "success",
    message: `Campaign ${data.campaign_name} successfully paused via MCP.`,
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2)
      }
    ]
  });
}
