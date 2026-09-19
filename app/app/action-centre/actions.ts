"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function resolveAgentDraft(draftId: string, action: 'approve' | 'reject' | 'edit', feedback?: string, editedPayload?: any) {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Determine the new status
  let status = "approved";
  if (action === "reject") status = "rejected";
  if (action === "edit") status = "edited";

  // Update the draft record to build the data moat
  const updatePayload: any = { 
    status, 
    human_feedback: feedback || null 
  };
  
  if (action === "edit" && editedPayload) {
    updatePayload.draft_payload = editedPayload;
  }

  const { error } = await supabase
    .from("ai_agent_drafts")
    .update(updatePayload)
    .eq("id", draftId);

  if (error) {
    console.error("Failed to resolve draft:", error);
    return { success: false, error: "Failed to update draft." };
  }

  // If approved or edited, execute the action!
  if (status === "approved" || status === "edited") {
    const { data: draft } = await supabase
      .from("ai_agent_drafts")
      .select("*")
      .eq("id", draftId)
      .single();
      
    if (draft && draft.proposed_action === "send_whatsapp_message") {
      // Execute the WhatsApp API call using the payload
      console.log("Executing approved WhatsApp message:", draft.draft_payload.text);
      // In a real implementation: await sendWhatsAppMessage(draft.draft_payload);
    }
  }

  revalidatePath("/app/action-centre");
  return { success: true };
}
