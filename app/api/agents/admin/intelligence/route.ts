import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    
    // In production, this would be a cron job running with a service_role key.
    // For this POC, we check if the caller is an OEM admin to manually trigger the scan.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: isOperator } = await supabase.rpc("is_platform_operator", { required_role: "oem_admin" });
    if (!isOperator) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // 1. Identify Churn Risk Organizations
    // Logic: Organizations created more than 3 days ago that have ZERO marketing campaigns.
    
    // First, get all orgs older than 3 days
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const { data: oldOrgs, error: orgError } = await supabase
      .from("organizations")
      .select("id, name")
      .lt("created_at", threeDaysAgo.toISOString());

    if (orgError) throw orgError;

    if (!oldOrgs || oldOrgs.length === 0) {
      return NextResponse.json({ status: "success", message: "No older organizations found." });
    }

    const draftsToInsert = [];

    for (const org of oldOrgs) {
      // Check if they have campaigns
      const { data: campaigns, error: campError } = await supabase
        .from("marketing_campaigns")
        .select("id")
        .eq("organization_id", org.id)
        .limit(1);
        
      if (campError) continue;
      
      // If no campaigns exist, they are a churn risk
      if (!campaigns || campaigns.length === 0) {
        
        // Ensure we haven't already drafted a warning for this org to prevent spam
        const { data: existingDraft } = await supabase
          .from("oem_agent_drafts")
          .select("id")
          .eq("context_source", "tenant_churn_risk")
          .contains("draft_payload", { target_organization_id: org.id })
          .limit(1);

        if (!existingDraft || existingDraft.length === 0) {
          draftsToInsert.push({
            context_source: "tenant_churn_risk",
            proposed_action: "send_whatsapp_message",
            draft_payload: {
              target_organization_id: org.id,
              target_organization_name: org.name,
              reasoning: `Tenant ${org.name} signed up over 3 days ago but hasn't launched any campaigns. High risk of churn.`,
              message_text: `Hi from OmniRelay! We noticed you haven't launched your first AI ad campaign yet. Would you like to schedule a quick 10-minute onboarding call with our success team?`
            }
          });
        }
      }
    }

    if (draftsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from("oem_agent_drafts")
        .insert(draftsToInsert);

      if (insertError) throw insertError;
    }

    return NextResponse.json({
      status: "success",
      message: `Scan complete. Queued ${draftsToInsert.length} OEM alerts.`
    });

  } catch (error: any) {
    console.error("[OEM Intelligence Error]", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
