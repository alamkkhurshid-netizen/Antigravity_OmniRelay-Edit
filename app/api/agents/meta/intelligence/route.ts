import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    
    // In production, this would be a cron job running with a service_role key.
    // For this POC, we check if the authenticated user has an organization.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("onboarding_profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization found" }, { status: 404 });
    }

    const orgId = profile.organization_id;

    // 1. Identify low performing campaigns (ROAS < 2.0)
    const { data: weakCampaigns, error: fetchError } = await supabase
      .from("marketing_campaigns")
      .select("*")
      .eq("organization_id", orgId)
      .eq("status", "active")
      .lt("roas", 2.0);

    if (fetchError) {
      throw fetchError;
    }

    if (!weakCampaigns || weakCampaigns.length === 0) {
      return NextResponse.json({ status: "success", message: "No weak campaigns found. All good!" });
    }

    // 2. Draft 'Pause' actions in the Action Centre for each weak campaign
    const draftsToInsert = weakCampaigns.map(campaign => ({
      organization_id: orgId,
      agent_role: "meta_intelligence",
      context_source: `campaign_id:${campaign.id}`,
      proposed_action: "pause_meta_campaign",
      draft_payload: {
        campaign_id: campaign.id,
        campaign_name: campaign.campaign_name,
        current_roas: campaign.roas,
        daily_budget: campaign.daily_budget,
        reasoning: `ROAS has dropped to ${campaign.roas}x (Target is >2.0x). Recommending immediate pause to stop ad spend bleed.`
      },
      status: "pending_approval"
    }));

    const { error: insertError } = await supabase
      .from("ai_agent_drafts")
      .insert(draftsToInsert);

    if (insertError) {
      throw insertError;
    }

    return NextResponse.json({
      status: "success",
      message: `Successfully queued ${draftsToInsert.length} scale/prune drafts to the Action Centre.`
    });

  } catch (error: any) {
    console.error("[Meta Intelligence Error]", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
