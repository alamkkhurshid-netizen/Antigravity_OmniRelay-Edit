"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// Helper: Send WhatsApp message via the Cloud API
async function sendWhatsAppMessage(orgId: string, recipientPhone: string, messageText: string) {
  const supabase = await createClient();
  
  // Fetch the organization's WhatsApp credentials
  const { data: connection } = await supabase
    .from("whatsapp_connections")
    .select("phone_number_id, access_token")
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!connection?.phone_number_id || !connection?.access_token) {
    console.error("[WhatsApp Send] No credentials found for org:", orgId);
    return { success: false, error: "WhatsApp credentials not configured" };
  }

  const url = `https://graph.facebook.com/v19.0/${connection.phone_number_id}/messages`;
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${connection.access_token}`,
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

  return { success: true, messageId: result.messages?.[0]?.id };
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
