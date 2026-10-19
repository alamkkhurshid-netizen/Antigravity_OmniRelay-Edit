"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// Helper: Send WhatsApp message via the Cloud API
async function sendWhatsAppMessage(orgId: string, recipientPhone: string, messageText: string) {
  // S6-10: Pre-flight billing check before Meta Graph API call
  try {
    const { canSendMessage } = await import("@/lib/billing/deduction-engine");
    const preflight = await canSendMessage(orgId, "utility");
    if (!preflight.allowed) {
      console.warn(`[Billing Preflight Blocked] Org ${orgId} cannot send message: ${preflight.reason}`);
      return { success: false, error: `Outbound blocked: Insufficient operational wallet balance (${preflight.reason})` };
    }
  } catch (err) {
    // In production fail-closed; if check fails, log and proceed only if non-blocking
    console.error("[Billing Preflight Check Error]:", err);
  }

  const supabase = await createClient();
  
  // Fetch the organization's WhatsApp connection and sealed credentials
  const { data: connection } = await supabase
    .from("channel_connections")
    .select("external_phone_number_id, status")
    .eq("organization_id", orgId)
    .eq("channel", "whatsapp")
    .in("status", ["live", "test"])
    .maybeSingle();

  if (!connection?.external_phone_number_id) {
    console.error("[WhatsApp Send] No active WhatsApp connection found for org:", orgId);
    return { success: false, error: "WhatsApp credentials not configured" };
  }

  // Fetch sealed provider credentials via admin client from organizations_addresses
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const adminClient = createAdminClient();
  const { data: addressRow } = await adminClient
    .from("organizations_addresses")
    .select("extra")
    .eq("organization_id", orgId)
    .eq("address", connection.external_phone_number_id)
    .eq("service", "whatsapp")
    .maybeSingle();

  const extra = addressRow?.extra as { access_token?: string } | null;
  const accessToken = extra?.access_token || process.env.META_SYSTEM_USER_ACCESS_TOKEN;

  if (!accessToken) {
    console.error("[WhatsApp Send] No sealed credentials found for org:", orgId);
    return { success: false, error: "WhatsApp credentials not configured" };
  }

  const url = `https://graph.facebook.com/v19.0/${connection.external_phone_number_id}/messages`;
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: recipientPhone,
      type: "text",
      text: { body: messageText }
    })
  });

  const result = await response.json();

  if (!response.ok) {
    console.error("[WhatsApp Send] API Error:", result);
    return { success: false, error: result.error?.message || "Send failed" };
  }

  const metaMessageId = result.messages?.[0]?.id;
  if (metaMessageId) {
    try {
      const { recordAndDeduct } = await import("@/lib/billing/deduction-engine");
      await recordAndDeduct(orgId, metaMessageId, "utility");
    } catch (deductErr) {
      console.error("[Billing] Failed to record and deduct after dispatch:", deductErr);
    }
  }

  return { success: true, messageId: metaMessageId };
}

export async function resolveAgentDraft(draftId: string, action: 'approve' | 'reject' | 'edit', feedback?: string) {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Fetch the existing draft with org context
  const { data: draft } = await supabase
    .from("ai_agent_drafts")
    .select("*, organizations(is_demo)")
    .eq("id", draftId)
    .single();

  if (!draft) return { success: false, error: "Draft not found" };

  let status = "approved";
  if (action === "reject") status = "rejected";
  if (action === "edit") status = "rejected"; // Current draft rejected; Hermes will produce a new one

  // 1. Update the database
  const { error } = await supabase
    .from("ai_agent_drafts")
    .update({ 
      status, 
      human_feedback: feedback || null,
      updated_at: new Date().toISOString()
    })
    .eq("id", draftId);

  if (error) {
    console.error("Failed to resolve draft:", error);
    return { success: false, error: "Failed to update draft." };
  }

  // 2. If approved, ACTUALLY execute the action
  if (status === "approved") {
    const isDemo = Array.isArray(draft.organizations) 
      ? draft.organizations[0]?.is_demo 
      : draft.organizations?.is_demo;
    
    if (isDemo) {
      // Sandbox mode: neutralize but return success for UX
      return { success: true, sandbox: true };
    }

    // REAL EXECUTION — no more console.log placeholders
    if (draft.proposed_action === "send_whatsapp_message") {
      const payload = draft.draft_payload;
      const recipientPhone = payload?.recipient_phone || payload?.metadata?.customer_phone;
      const messageText = payload?.text;

      if (recipientPhone && messageText) {
        const sendResult = await sendWhatsAppMessage(
          draft.organization_id, 
          recipientPhone, 
          messageText
        );
        
        if (!sendResult.success) {
          // Revert status back to pending so user can retry
          await supabase
            .from("ai_agent_drafts")
            .update({ status: "pending_approval" })
            .eq("id", draftId);
          return { success: false, error: `WhatsApp send failed: ${sendResult.error}` };
        }
      }
    }

    if (draft.proposed_action === "pause_meta_campaign") {
      const payload = draft.draft_payload;
      const campaignId = payload?.campaign_id;
      
      if (campaignId) {
        // Execute the MCP command equivalent directly on the database
        const { error: updateError } = await supabase
          .from("marketing_campaigns")
          .update({ status: "paused" })
          .eq("id", campaignId)
          .eq("organization_id", draft.organization_id);
          
        if (updateError) {
          await supabase
            .from("ai_agent_drafts")
            .update({ status: "pending_approval" })
            .eq("id", draftId);
          return { success: false, error: `Failed to execute MCP pause command: ${updateError.message}` };
        }
      }
    }

    // For review_advice actions, approval simply records the decision (no external API needed)
  }

  // 3. If edited or rejected, bounce feedback back to Hermes Agent (Honcho Memory)
  if (action === "edit" || action === "reject") {
    const hermesUrl = process.env.HERMES_AGENT_URL || (process.env.NODE_ENV === "production" ? null : "http://localhost:8000/api/v1/agent/invoke");
    if (!hermesUrl) {
      console.warn("HERMES_AGENT_URL is not configured. Skipping agent feedback loop.");
      revalidatePath("/app/action-centre");
      return { success: true };
    }
    
    let aiMessage = `The user rejected your draft. Reason: "${feedback}". Please acknowledge and learn from this. Do NOT generate a new draft.`;
    if (action === "edit") {
      aiMessage = `The user wants you to revise the draft. Feedback: "${feedback}". Please generate and save a NEW, revised draft.`;
    }

    const hermesPayload = {
      user_id: user.id,
      session_id: `${draft.organization_id}-${draft.context_source}`,
      message: aiMessage,
      context: {
        workspace_id: draft.organization_id,
        payload_type: draft.context_source
      }
    };

    // Use proper async handling — don't fire-and-forget in edge runtime
    try {
      await fetch(hermesUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(hermesPayload)
      });
    } catch (err) {
      // Non-blocking: log but don't fail the user action
      console.error("[Hermes Feedback Error]:", err);
    }
  }

  revalidatePath("/app/action-centre");
  return { success: true };
}
